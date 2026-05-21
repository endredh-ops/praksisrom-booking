import React, { useState, useEffect, useMemo } from 'react';
import { X, ChevronLeft, ChevronRight, Trash2, Plus, Home, Stethoscope, AlertCircle, Check, Download, Upload, Calendar } from 'lucide-react';
import * as XLSX from 'xlsx';

// localStorage-skall som etterligner det opprinnelige storage-API-et.
// All data lagres i nettleseren — hver bruker har sin egen kopi.
// For ekte fler-bruker-deling, bytt ut dette med Firebase, Supabase eller en backend.
const storage = {
  async list(prefix) {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) keys.push(k);
    }
    return { keys };
  },
  async get(key) {
    const value = localStorage.getItem(key);
    if (value === null) throw new Error('not found');
    return { value };
  },
  async set(key, value) {
    localStorage.setItem(key, value);
    return { ok: true };
  },
  async delete(key) {
    localStorage.removeItem(key);
    return { ok: true };
  }
};

// Norske skoleferier 2026/2027 (Oslo - standard ferier, kan justeres)
const HOLIDAYS_2026_27 = new Set([
  // Høstferie uke 40
  '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02',
  // Juleferie
  '2026-12-21', '2026-12-22', '2026-12-23', '2026-12-24', '2026-12-25',
  '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01',
  // Vinterferie uke 8
  '2027-02-22', '2027-02-23', '2027-02-24', '2027-02-25', '2027-02-26',
  // Påskeferie
  '2027-03-22', '2027-03-23', '2027-03-24', '2027-03-25', '2027-03-26',
  '2027-03-29', '2027-03-30',
  // 17. mai 2027
  '2027-05-17',
  // Kr. Himmelfart
  '2027-05-06', '2027-05-07',
]);

const ROOMS = [
  { id: 'praksisrom', name: 'Praksisrom', short: 'PR', icon: Stethoscope, color: 'var(--rust)', bg: 'var(--rust-soft)' },
  { id: 'omsorgsleilighet', name: 'Omsorgsleilighet', short: 'OL', icon: Home, color: 'var(--sage)', bg: 'var(--sage-soft)' }
];

const SLOTS = [
  { id: 'formiddag', label: 'Formiddag', short: 'F', time: '08:00 – 11:30' },
  { id: 'ettermiddag', label: 'Ettermiddag', short: 'E', time: '12:00 – 15:30' },
  { id: 'heldag', label: 'Hel dag', short: 'H', time: '08:00 – 15:30' }
];

const SCHOOL_YEAR_START = new Date(2026, 7, 17);
const SCHOOL_YEAR_END = new Date(2027, 5, 18);

function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isSchoolDay(d) {
  if (d < SCHOOL_YEAR_START || d > SCHOOL_YEAR_END) return false;
  const day = d.getDay();
  if (day === 0 || day === 6) return false;
  if (HOLIDAYS_2026_27.has(formatDate(d))) return false;
  return true;
}

function getMonthName(monthIdx) {
  return ['januar','februar','mars','april','mai','juni','juli','august','september','oktober','november','desember'][monthIdx];
}

function getWeekdayShort(idx) {
  return ['søn','man','tir','ons','tor','fre','lør'][idx];
}

function getWeekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

function slotsConflict(a, b) {
  if (a === b) return true;
  if (a === 'heldag' || b === 'heldag') return true;
  return false;
}

export default function BookingSystem() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMonth, setViewMonth] = useState(new Date(2026, 7, 1));
  const [roomFilter, setRoomFilter] = useState('alle'); // 'alle' | 'praksisrom' | 'omsorgsleilighet'
  const [modalDate, setModalDate] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ room: 'praksisrom', slot: 'formiddag', class: '', teacher: '' });
  const [formError, setFormError] = useState('');
  const [toast, setToast] = useState(null);
  const [importPreview, setImportPreview] = useState(null); // { newRows, duplicates, errors }
  const [importing, setImporting] = useState(false);
  const [calendarExport, setCalendarExport] = useState(null); // { type: 'all'|'teacher'|'room', value: '...' }

  useEffect(() => {
    (async () => {
      try {
        const list = await storage.list('booking:');
        if (list && list.keys && list.keys.length > 0) {
          const loaded = [];
          for (const key of list.keys) {
            try {
              const res = await storage.get(key);
              if (res && res.value) loaded.push(JSON.parse(res.value));
            } catch (e) { /* skip */ }
          }
          setBookings(loaded);
        }
      } catch (e) {
        console.error('Kunne ikke laste bookinger:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2800);
  };

  // Filter brukes kun til visning i kalender
  const visibleBookings = useMemo(() => {
    if (roomFilter === 'alle') return bookings;
    return bookings.filter(b => b.room === roomFilter);
  }, [bookings, roomFilter]);

  const bookingsByDate = useMemo(() => {
    const map = {};
    for (const b of visibleBookings) {
      if (!map[b.date]) map[b.date] = [];
      map[b.date].push(b);
    }
    return map;
  }, [visibleBookings]);

  // Konfliktsjekk + dagsmodal — alltid alle bookinger, uavhengig av filter
  const allBookingsByDateRoom = useMemo(() => {
    const map = {};
    for (const b of bookings) {
      const key = `${b.date}|${b.room}`;
      if (!map[key]) map[key] = [];
      map[key].push(b);
    }
    return map;
  }, [bookings]);

  const monthDays = useMemo(() => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const startDay = first.getDay() === 0 ? 6 : first.getDay() - 1;
    const cells = [];
    for (let i = 0; i < startDay; i++) cells.push(null);
    for (let d = 1; d <= last.getDate(); d++) {
      cells.push(new Date(year, month, d));
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [viewMonth]);

  const weekRows = useMemo(() => {
    const rows = [];
    for (let i = 0; i < monthDays.length; i += 7) {
      rows.push(monthDays.slice(i, i + 7));
    }
    return rows;
  }, [monthDays]);

  const canGoPrev = viewMonth > new Date(2026, 7, 1);
  const canGoNext = viewMonth < new Date(2027, 5, 1);

  const dayBookingsForRoom = (date, room) => {
    if (!date) return [];
    return allBookingsByDateRoom[`${formatDate(date)}|${room}`] || [];
  };

  const openDayModal = (date) => {
    if (!isSchoolDay(date)) return;
    setModalDate(date);
    setShowForm(false);
    setFormData({
      room: roomFilter === 'alle' ? 'praksisrom' : roomFilter,
      slot: 'formiddag',
      class: '',
      teacher: ''
    });
    setFormError('');
  };

  const closeModal = () => {
    setModalDate(null);
    setShowForm(false);
    setFormError('');
  };

  const handleBook = async () => {
    setFormError('');
    if (!formData.class.trim() || !formData.teacher.trim()) {
      setFormError('Fyll inn både klasse og lærer.');
      return;
    }
    const dateStr = formatDate(modalDate);
    const existing = dayBookingsForRoom(modalDate, formData.room);
    const conflict = existing.find(b => slotsConflict(b.slot, formData.slot));
    if (conflict) {
      setFormError(`Rommet er allerede booket på dette tidspunktet av ${conflict.class} (${conflict.teacher}).`);
      return;
    }
    const newBooking = {
      id: `${dateStr}-${formData.room}-${formData.slot}-${Date.now()}`,
      date: dateStr,
      room: formData.room,
      slot: formData.slot,
      class: formData.class.trim(),
      teacher: formData.teacher.trim(),
      created: new Date().toISOString()
    };
    try {
      await storage.set(`booking:${newBooking.id}`, JSON.stringify(newBooking));
      setBookings(prev => [...prev, newBooking]);
      setShowForm(false);
      setFormData({ room: formData.room, slot: 'formiddag', class: '', teacher: '' });
      showToast('Booking lagret');
    } catch (e) {
      setFormError('Kunne ikke lagre booking. Prøv igjen.');
    }
  };

  const handleExport = () => {
    if (bookings.length === 0) {
      showToast('Ingen bookinger å eksportere', 'error');
      return;
    }
    try {
      const slotLabel = { formiddag: 'Formiddag', ettermiddag: 'Ettermiddag', heldag: 'Hel dag' };
      const slotTime = { formiddag: '08:00–11:30', ettermiddag: '12:00–15:30', heldag: '08:00–15:30' };
      const roomLabel = { praksisrom: 'Praksisrom', omsorgsleilighet: 'Omsorgsleilighet' };

      const sorted = [...bookings].sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        const slotOrder = { formiddag: 0, heldag: 1, ettermiddag: 2 };
        return slotOrder[a.slot] - slotOrder[b.slot];
      });

      const rows = sorted.map(b => {
        const d = new Date(b.date + 'T00:00:00');
        const weekday = ['Søndag','Mandag','Tirsdag','Onsdag','Torsdag','Fredag','Lørdag'][d.getDay()];
        return {
          'Dato': b.date,
          'Ukedag': weekday,
          'Uke': getWeekNumber(d),
          'Rom': roomLabel[b.room] || b.room,
          'Tidspunkt': slotLabel[b.slot] || b.slot,
          'Klokkeslett': slotTime[b.slot] || '',
          'Klasse': b.class,
          'Lærer': b.teacher,
          'Registrert': b.created ? new Date(b.created).toLocaleString('nb-NO') : ''
        };
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [
        { wch: 12 }, // Dato
        { wch: 10 }, // Ukedag
        { wch: 6 },  // Uke
        { wch: 18 }, // Rom
        { wch: 13 }, // Tidspunkt
        { wch: 14 }, // Klokkeslett
        { wch: 14 }, // Klasse
        { wch: 22 }, // Lærer
        { wch: 20 }  // Registrert
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Bookinger');

      const today = new Date();
      const stamp = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
      const filename = `praksisrom-bookinger-${stamp}.xlsx`;

      XLSX.writeFile(wb, filename);
      showToast(`Eksportert ${rows.length} bookinger`);
    } catch (e) {
      console.error(e);
      showToast('Kunne ikke eksportere', 'error');
    }
  };

  const handleDelete = async (booking) => {
    try {
      await storage.delete(`booking:${booking.id}`);
      setBookings(prev => prev.filter(b => b.id !== booking.id));
      showToast('Booking slettet');
    } catch (e) {
      showToast('Kunne ikke slette', 'error');
    }
  };

  // Hjelpefunksjoner for import
  const normalizeRoom = (val) => {
    if (!val) return null;
    const s = String(val).toLowerCase().trim();
    if (s.includes('praksis')) return 'praksisrom';
    if (s.includes('omsorg')) return 'omsorgsleilighet';
    return null;
  };

  const normalizeSlot = (val) => {
    if (!val) return null;
    const s = String(val).toLowerCase().trim();
    if (s.includes('formidd')) return 'formiddag';
    if (s.includes('ettermidd')) return 'ettermiddag';
    if (s.includes('hel')) return 'heldag';
    return null;
  };

  const normalizeDate = (val) => {
    if (!val) return null;
    // Excel-dato kan komme som tall (serial), Date-objekt, eller streng
    if (val instanceof Date) {
      return formatDate(val);
    }
    if (typeof val === 'number') {
      // Excel serial date — XLSX gir oss dette med cellDates option, men håndter likevel
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      const d = new Date(excelEpoch.getTime() + val * 86400000);
      return formatDate(d);
    }
    const s = String(val).trim();
    // Forventet format: YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    // Prøv å parse andre vanlige formater (DD.MM.YYYY, DD/MM/YYYY)
    const m = s.match(/^(\d{1,2})[.\/\-](\d{1,2})[.\/\-](\d{2,4})$/);
    if (m) {
      let [, dd, mm, yy] = m;
      if (yy.length === 2) yy = '20' + yy;
      return `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    }
    return null;
  };

  const handleFileSelected = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // tillat re-import av samme fil
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const wb = XLSX.read(data, { type: 'array', cellDates: true });
        const sheetName = wb.SheetNames[0];
        if (!sheetName) {
          showToast('Excel-fila er tom', 'error');
          return;
        }
        const sheet = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        // Bygg sett av eksisterende bookinger for duplikatsjekk
        const existing = new Set(bookings.map(b => `${b.date}|${b.room}|${b.slot}`));
        const seenInImport = new Set();

        const newRows = [];
        const duplicates = [];
        const errors = [];

        rows.forEach((row, idx) => {
          const rowNum = idx + 2; // +1 for header, +1 for 1-indeksering
          // Aksepter både norske og engelske kolonnenavn
          const dateRaw = row['Dato'] ?? row['dato'] ?? row['Date'];
          const roomRaw = row['Rom'] ?? row['rom'] ?? row['Room'];
          const slotRaw = row['Tidspunkt'] ?? row['tidspunkt'] ?? row['Slot'];
          const classRaw = row['Klasse'] ?? row['klasse'] ?? row['Class'];
          const teacherRaw = row['Lærer'] ?? row['lærer'] ?? row['Laerer'] ?? row['Teacher'];

          const date = normalizeDate(dateRaw);
          const room = normalizeRoom(roomRaw);
          const slot = normalizeSlot(slotRaw);
          const className = String(classRaw || '').trim();
          const teacher = String(teacherRaw || '').trim();

          if (!date) { errors.push(`Rad ${rowNum}: ugyldig dato (${dateRaw})`); return; }
          if (!room) { errors.push(`Rad ${rowNum}: ukjent rom (${roomRaw})`); return; }
          if (!slot) { errors.push(`Rad ${rowNum}: ukjent tidspunkt (${slotRaw})`); return; }
          if (!className) { errors.push(`Rad ${rowNum}: klasse mangler`); return; }
          if (!teacher) { errors.push(`Rad ${rowNum}: lærer mangler`); return; }

          // Sjekk at dato er en gyldig skoledag
          const dObj = new Date(date + 'T00:00:00');
          if (!isSchoolDay(dObj)) {
            errors.push(`Rad ${rowNum}: ${date} er ikke en skoledag`);
            return;
          }

          const key = `${date}|${room}|${slot}`;
          if (existing.has(key) || seenInImport.has(key)) {
            duplicates.push({ date, room, slot, class: className, teacher });
            return;
          }
          // Sjekk også konflikt med heldag/halv dag i samme fil
          const heldagKey = `${date}|${room}|heldag`;
          const formKey = `${date}|${room}|formiddag`;
          const ettKey = `${date}|${room}|ettermiddag`;
          if (slot === 'heldag' && (existing.has(formKey) || existing.has(ettKey) || seenInImport.has(formKey) || seenInImport.has(ettKey))) {
            duplicates.push({ date, room, slot, class: className, teacher });
            return;
          }
          if ((slot === 'formiddag' || slot === 'ettermiddag') && (existing.has(heldagKey) || seenInImport.has(heldagKey))) {
            duplicates.push({ date, room, slot, class: className, teacher });
            return;
          }

          seenInImport.add(key);
          newRows.push({ date, room, slot, class: className, teacher });
        });

        setImportPreview({ newRows, duplicates, errors, totalRows: rows.length });
      } catch (err) {
        console.error(err);
        showToast('Kunne ikke lese fila. Sjekk at det er en gyldig Excel-fil.', 'error');
      }
    };
    reader.onerror = () => showToast('Kunne ikke lese fila', 'error');
    reader.readAsArrayBuffer(file);
  };

  const confirmImport = async () => {
    if (!importPreview || importPreview.newRows.length === 0) return;
    setImporting(true);
    try {
      const added = [];
      for (const row of importPreview.newRows) {
        const id = `${row.date}-${row.room}-${row.slot}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
        const booking = {
          id,
          date: row.date,
          room: row.room,
          slot: row.slot,
          class: row.class,
          teacher: row.teacher,
          created: new Date().toISOString()
        };
        await storage.set(`booking:${booking.id}`, JSON.stringify(booking));
        added.push(booking);
      }
      setBookings(prev => [...prev, ...added]);
      setImportPreview(null);
      showToast(`Importerte ${added.length} bookinger`);
    } catch (e) {
      console.error(e);
      showToast('Feil under import', 'error');
    } finally {
      setImporting(false);
    }
  };

  const cancelImport = () => setImportPreview(null);

  // Liste over unike lærere for filtervalg
  const uniqueTeachers = useMemo(() => {
    const set = new Set(bookings.map(b => b.teacher).filter(Boolean));
    return [...set].sort((a, b) => a.localeCompare(b, 'nb'));
  }, [bookings]);

  // Escape spesialtegn i iCalendar-tekst (RFC 5545)
  const icsEscape = (s) => {
    if (!s) return '';
    return String(s)
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\n/g, '\\n');
  };

  // Lag iCalendar-datetime-streng i lokal tid (uten Z = floating time)
  const icsDateTime = (dateStr, timeStr) => {
    // dateStr: "2026-08-17", timeStr: "08:00"
    const [y, m, d] = dateStr.split('-');
    const [hh, mm] = timeStr.split(':');
    return `${y}${m}${d}T${hh}${mm}00`;
  };

  // Foldelinje hvis > 75 oktetter (RFC 5545)
  const foldLine = (line) => {
    if (line.length <= 75) return line;
    const chunks = [];
    let i = 0;
    chunks.push(line.slice(0, 75));
    i = 75;
    while (i < line.length) {
      chunks.push(' ' + line.slice(i, i + 74));
      i += 74;
    }
    return chunks.join('\r\n');
  };

  const buildICS = (bookingsToExport, calendarName) => {
    const slotTimes = {
      formiddag: { start: '08:00', end: '11:30' },
      ettermiddag: { start: '12:00', end: '15:30' },
      heldag: { start: '08:00', end: '15:30' }
    };
    const slotLabel = { formiddag: 'Formiddag', ettermiddag: 'Ettermiddag', heldag: 'Hel dag' };
    const roomLabel = { praksisrom: 'Praksisrom', omsorgsleilighet: 'Omsorgsleilighet' };

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Praksisrom Helsefag//Booking System//NO',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      foldLine(`X-WR-CALNAME:${icsEscape(calendarName)}`),
      'X-WR-TIMEZONE:Europe/Oslo',
      // VTIMEZONE-blokk for Europe/Oslo så Outlook bruker riktig tid
      'BEGIN:VTIMEZONE',
      'TZID:Europe/Oslo',
      'BEGIN:STANDARD',
      'DTSTART:19701025T030000',
      'TZOFFSETFROM:+0200',
      'TZOFFSETTO:+0100',
      'TZNAME:CET',
      'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
      'END:STANDARD',
      'BEGIN:DAYLIGHT',
      'DTSTART:19700329T020000',
      'TZOFFSETFROM:+0100',
      'TZOFFSETTO:+0200',
      'TZNAME:CEST',
      'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
      'END:DAYLIGHT',
      'END:VTIMEZONE'
    ];

    const dtStamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

    for (const b of bookingsToExport) {
      const time = slotTimes[b.slot];
      const room = roomLabel[b.room] || b.room;
      const slot = slotLabel[b.slot] || b.slot;
      const summary = `${b.class} – ${room}`;
      const description = `Klasse: ${b.class}\nLærer: ${b.teacher}\nRom: ${room}\nTidspunkt: ${slot} (${time.start}–${time.end})`;
      const uid = `${b.id}@praksisrom-helsefag`;

      lines.push('BEGIN:VEVENT');
      lines.push(foldLine(`UID:${uid}`));
      lines.push(`DTSTAMP:${dtStamp}`);
      lines.push(`DTSTART;TZID=Europe/Oslo:${icsDateTime(b.date, time.start)}`);
      lines.push(`DTEND;TZID=Europe/Oslo:${icsDateTime(b.date, time.end)}`);
      lines.push(foldLine(`SUMMARY:${icsEscape(summary)}`));
      lines.push(foldLine(`LOCATION:${icsEscape(room)}`));
      lines.push(foldLine(`DESCRIPTION:${icsEscape(description)}`));
      lines.push(`CATEGORIES:${icsEscape(room)}`);
      lines.push('STATUS:CONFIRMED');
      lines.push('TRANSP:OPAQUE');
      lines.push('END:VEVENT');
    }

    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  };

  const downloadICS = (content, filename) => {
    const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleCalendarExport = (type, value) => {
    let filtered;
    let name;
    let filenameSuffix;

    if (type === 'all') {
      filtered = bookings;
      name = 'Praksisrom Helsefag – alle bookinger';
      filenameSuffix = 'alle';
    } else if (type === 'teacher') {
      filtered = bookings.filter(b => b.teacher === value);
      name = `Praksisrom Helsefag – ${value}`;
      filenameSuffix = value.toLowerCase().replace(/[^a-z0-9]+/gi, '-');
    } else if (type === 'room') {
      filtered = bookings.filter(b => b.room === value);
      const roomName = value === 'praksisrom' ? 'Praksisrom' : 'Omsorgsleilighet';
      name = `${roomName} – bookinger`;
      filenameSuffix = value;
    }

    if (!filtered || filtered.length === 0) {
      showToast('Ingen bookinger å eksportere', 'error');
      return;
    }

    const ics = buildICS(filtered, name);
    const today = new Date();
    const stamp = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    downloadICS(ics, `praksisrom-${filenameSuffix}-${stamp}.ics`);
    setCalendarExport(null);
    showToast(`Eksporterte ${filtered.length} avtaler til kalender`);
  };

  const sortBookings = (arr) => {
    const slotOrder = { formiddag: 0, heldag: 1, ettermiddag: 2 };
    const roomOrder = { praksisrom: 0, omsorgsleilighet: 1 };
    return [...arr].sort((a, b) => {
      const s = slotOrder[a.slot] - slotOrder[b.slot];
      if (s !== 0) return s;
      return roomOrder[a.room] - roomOrder[b.room];
    });
  };

  return (
    <div className="booking-app">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Inter+Tight:wght@400;500;600;700&display=swap');

        .booking-app {
          --bg: #f5f1ea;
          --bg-card: #fffdf8;
          --ink: #1a1612;
          --ink-soft: #5a4f44;
          --ink-mute: #9a8d7d;
          --line: #e3dccf;
          --line-soft: #ece6da;
          --rust: #b04a2a;
          --rust-soft: #f3d9cd;
          --sage: #5d7a5a;
          --sage-soft: #d4dfd0;
          --gold: #c89c4a;

          font-family: 'Inter Tight', sans-serif;
          background: var(--bg);
          color: var(--ink);
          min-height: 100vh;
          padding: 32px 24px 80px;
        }

        .booking-app * { box-sizing: border-box; }

        .container { max-width: 1340px; margin: 0 auto; }

        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          margin-bottom: 32px;
          padding-bottom: 24px;
          border-bottom: 1px solid var(--line);
        }
        .header-title h1 {
          font-family: 'Fraunces', serif;
          font-weight: 500;
          font-size: 44px;
          letter-spacing: -0.02em;
          margin: 0 0 4px;
          line-height: 1;
        }
        .header-title h1 em {
          font-style: italic;
          color: var(--rust);
          font-weight: 400;
        }
        .header-title p {
          margin: 0;
          color: var(--ink-soft);
          font-size: 14px;
          letter-spacing: 0.01em;
        }
        .header-meta {
          text-align: right;
          font-size: 12px;
          color: var(--ink-mute);
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .header-meta strong {
          display: block;
          font-family: 'Fraunces', serif;
          font-style: italic;
          font-weight: 400;
          font-size: 22px;
          color: var(--ink);
          letter-spacing: -0.01em;
          text-transform: none;
          margin-top: 2px;
        }

        .filter-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 22px;
          gap: 16px;
          flex-wrap: wrap;
        }
        .filter-label {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--ink-mute);
        }
        .room-filter {
          display: flex;
          gap: 0;
          background: var(--bg-card);
          border: 1px solid var(--line);
          border-radius: 4px;
          padding: 5px;
        }
        .filter-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          background: transparent;
          border: none;
          cursor: pointer;
          font-family: inherit;
          font-size: 13px;
          font-weight: 500;
          color: var(--ink-soft);
          border-radius: 2px;
          transition: all 0.15s;
        }
        .filter-btn:hover { color: var(--ink); }
        .filter-btn.active { background: var(--ink); color: var(--bg); }
        .filter-btn-dot {
          width: 8px; height: 8px; border-radius: 50%;
        }
        .filter-btn[data-room="alle"] .filter-btn-dot {
          background: linear-gradient(90deg, var(--rust) 50%, var(--sage) 50%);
        }
        .filter-btn[data-room="praksisrom"] .filter-btn-dot { background: var(--rust); }
        .filter-btn[data-room="omsorgsleilighet"] .filter-btn-dot { background: var(--sage); }

        .export-btn {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 9px 14px;
          background: var(--bg-card);
          border: 1px solid var(--line);
          border-radius: 4px;
          font-family: inherit;
          font-size: 12px;
          font-weight: 500;
          color: var(--ink-soft);
          cursor: pointer;
          transition: all 0.15s;
          letter-spacing: 0.01em;
        }
        .export-btn:hover {
          background: var(--ink);
          color: var(--bg);
          border-color: var(--ink);
        }

        /* Import preview */
        .import-summary {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
          margin-bottom: 22px;
        }
        .import-stat {
          padding: 14px 12px;
          border-radius: 6px;
          text-align: center;
          background: var(--bg);
          border: 1px solid var(--line);
        }
        .import-stat-ok { border-color: var(--sage); background: var(--sage-soft); }
        .import-stat-warn { border-color: var(--gold); background: #fff4ec; }
        .import-stat-error { border-color: var(--rust); background: var(--rust-soft); }
        .import-stat-num {
          font-family: 'Fraunces', serif;
          font-size: 28px;
          font-weight: 500;
          line-height: 1;
          font-feature-settings: "tnum";
        }
        .import-stat-label {
          font-size: 11px;
          color: var(--ink-soft);
          margin-top: 4px;
          line-height: 1.3;
        }

        .import-section { margin-bottom: 18px; }
        .import-section h4 {
          font-family: 'Fraunces', serif;
          font-size: 15px;
          font-weight: 500;
          margin: 0 0 6px;
          letter-spacing: -0.005em;
        }
        .import-section-help {
          font-size: 12px;
          color: var(--ink-mute);
          margin: 0 0 10px;
        }

        .import-list { display: flex; flex-direction: column; gap: 4px; }
        .import-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 12px;
          background: var(--bg);
          border-radius: 4px;
          font-size: 12px;
          flex-wrap: wrap;
        }
        .import-item-ok { border-left: 3px solid var(--sage); }
        .import-item-warn { border-left: 3px solid var(--gold); }
        .import-item-error {
          border-left: 3px solid var(--rust);
          background: var(--rust-soft);
          color: var(--ink);
        }
        .import-item-date {
          font-feature-settings: "tnum";
          font-weight: 600;
          color: var(--ink);
        }
        .import-item-room {
          font-size: 10px;
          font-weight: 700;
          padding: 2px 5px;
          border-radius: 2px;
          color: var(--bg-card);
          letter-spacing: 0.05em;
        }
        .import-item-room[data-room="praksisrom"] { background: var(--rust); }
        .import-item-room[data-room="omsorgsleilighet"] { background: var(--sage); }
        .import-item-meta {
          color: var(--ink-soft);
          margin-left: auto;
          font-size: 11px;
        }
        .import-more {
          padding: 6px 12px;
          font-size: 12px;
          font-style: italic;
          color: var(--ink-mute);
          font-family: 'Fraunces', serif;
        }

        /* Import preview slutt */

        /* Kalender-eksport */
        .cal-info {
          display: flex;
          gap: 10px;
          padding: 14px 16px;
          background: #fff4ec;
          border: 1px solid var(--gold);
          border-radius: 6px;
          font-size: 13px;
          color: var(--ink-soft);
          line-height: 1.5;
          margin-bottom: 22px;
        }
        .cal-info strong { color: var(--ink); font-weight: 600; }

        .cal-section { margin-bottom: 22px; }
        .cal-section:last-child { margin-bottom: 0; }
        .cal-section h4 {
          font-family: 'Fraunces', serif;
          font-size: 16px;
          font-weight: 500;
          margin: 0 0 10px;
          letter-spacing: -0.005em;
        }
        .cal-options-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }
        .cal-option {
          display: flex;
          align-items: center;
          gap: 12px;
          width: 100%;
          padding: 14px 16px;
          background: var(--bg);
          border: 1px solid var(--line);
          border-radius: 6px;
          cursor: pointer;
          font-family: inherit;
          text-align: left;
          transition: all 0.15s;
        }
        .cal-option:hover:not(:disabled) {
          background: var(--bg-card);
          border-color: var(--ink-soft);
          transform: translateY(-1px);
        }
        .cal-option:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .cal-option-icon {
          width: 36px; height: 36px;
          border-radius: 6px;
          background: var(--bg-card);
          color: var(--ink-soft);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          border: 1px solid var(--line);
        }
        .cal-option-icon[data-room="praksisrom"] {
          background: var(--rust-soft);
          border-color: var(--rust);
        }
        .cal-option-icon[data-room="omsorgsleilighet"] {
          background: var(--sage-soft);
          border-color: var(--sage);
        }
        .cal-option-dot {
          width: 10px; height: 10px;
          border-radius: 50%;
        }
        .cal-option-icon[data-room="praksisrom"] .cal-option-dot { background: var(--rust); }
        .cal-option-icon[data-room="omsorgsleilighet"] .cal-option-dot { background: var(--sage); }
        .cal-option-body { flex: 1; min-width: 0; }
        .cal-option-title {
          font-weight: 600;
          font-size: 14px;
          color: var(--ink);
          margin-bottom: 2px;
        }
        .cal-option-meta {
          font-size: 12px;
          color: var(--ink-mute);
        }
        .cal-option-arrow {
          color: var(--ink-mute);
          flex-shrink: 0;
        }
        .cal-option:hover:not(:disabled) .cal-option-arrow {
          color: var(--rust);
        }
        .cal-teacher-list {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          max-height: 280px;
          overflow-y: auto;
          padding-right: 4px;
        }
        .cal-option-compact { padding: 10px 14px; }
        .cal-option-compact .cal-option-title { font-size: 13px; }
        .cal-option-compact .cal-option-meta { font-size: 11px; }
        /* Kalender-eksport slutt */

        .legend {
          display: flex;
          gap: 18px;
          font-size: 12px;
          color: var(--ink-soft);
          flex-wrap: wrap;
        }
        .legend-group { display: flex; align-items: center; gap: 7px; }
        .legend-block {
          width: 14px; height: 14px;
          border-radius: 2px;
        }

        .calendar-shell {
          background: var(--bg-card);
          border: 1px solid var(--line);
          border-radius: 6px;
          overflow: hidden;
        }

        .calendar-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 22px 28px;
          border-bottom: 1px solid var(--line-soft);
        }
        .calendar-month {
          font-family: 'Fraunces', serif;
          font-size: 28px;
          font-weight: 500;
          letter-spacing: -0.01em;
          text-transform: lowercase;
        }
        .calendar-month em { font-style: italic; color: var(--ink-mute); font-weight: 400; }
        .nav-buttons { display: flex; gap: 8px; }
        .nav-btn {
          width: 38px; height: 38px;
          display: flex; align-items: center; justify-content: center;
          background: var(--bg);
          border: 1px solid var(--line);
          border-radius: 4px;
          cursor: pointer;
          color: var(--ink);
          transition: all 0.15s;
        }
        .nav-btn:hover:not(:disabled) { background: var(--ink); color: var(--bg); border-color: var(--ink); }
        .nav-btn:disabled { opacity: 0.3; cursor: not-allowed; }

        .calendar-grid {
          display: grid;
          grid-template-columns: 56px repeat(5, 1fr);
          background: var(--line-soft);
          gap: 1px;
        }
        .calendar-header-cell {
          background: var(--bg-card);
          padding: 14px 12px;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--ink-mute);
        }
        .calendar-header-cell.week-col { text-align: center; }

        .week-label {
          background: var(--bg);
          padding: 14px 8px;
          font-size: 11px;
          color: var(--ink-mute);
          font-weight: 500;
          text-align: center;
          letter-spacing: 0.05em;
          font-feature-settings: "tnum";
        }

        .day-cell {
          background: var(--bg-card);
          min-height: 150px;
          padding: 10px 10px 10px 12px;
          cursor: pointer;
          transition: background 0.15s;
          display: flex;
          flex-direction: column;
          gap: 5px;
          position: relative;
        }
        .day-cell:hover:not(.not-school):not(.empty) { background: #faf6ed; }
        .day-cell.empty, .day-cell.not-school {
          cursor: default;
          background: repeating-linear-gradient(
            -45deg,
            var(--bg-card),
            var(--bg-card) 8px,
            #f7f2e7 8px,
            #f7f2e7 9px
          );
        }
        .day-cell.empty { background: #f0ebdf; }
        .day-cell.not-school .day-num { color: var(--ink-mute); }

        .day-num {
          font-family: 'Fraunces', serif;
          font-size: 18px;
          font-weight: 500;
          line-height: 1;
          font-feature-settings: "tnum";
        }
        .day-meta {
          font-size: 10px;
          color: var(--ink-mute);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          margin-top: -2px;
        }

        .booking-chip {
          font-size: 11px;
          padding: 4px 7px 4px 0;
          border-radius: 3px;
          line-height: 1.3;
          display: flex;
          gap: 7px;
          overflow: hidden;
        }
        .booking-chip-bar {
          width: 3px;
          flex-shrink: 0;
          border-radius: 2px;
        }
        .booking-chip[data-room="praksisrom"] { background: var(--rust-soft); }
        .booking-chip[data-room="praksisrom"] .booking-chip-bar { background: var(--rust); }
        .booking-chip[data-room="omsorgsleilighet"] { background: var(--sage-soft); }
        .booking-chip[data-room="omsorgsleilighet"] .booking-chip-bar { background: var(--sage); }
        .booking-chip-body { flex: 1; min-width: 0; padding: 1px 0; }
        .booking-chip-top {
          display: flex;
          align-items: center;
          gap: 5px;
          margin-bottom: 1px;
        }
        .booking-chip-tag {
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.06em;
          padding: 1px 4px;
          border-radius: 2px;
          color: var(--bg-card);
          flex-shrink: 0;
        }
        .booking-chip[data-room="praksisrom"] .booking-chip-tag { background: var(--rust); }
        .booking-chip[data-room="omsorgsleilighet"] .booking-chip-tag { background: var(--sage); }
        .booking-chip-slot {
          font-size: 9px;
          font-weight: 600;
          color: var(--ink-soft);
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        .booking-chip-class {
          font-weight: 600;
          color: var(--ink);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .booking-chip-teacher {
          font-size: 10px;
          color: var(--ink-soft);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .add-hint {
          position: absolute;
          bottom: 8px; right: 8px;
          width: 22px; height: 22px;
          border-radius: 50%;
          background: var(--ink);
          color: var(--bg);
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          transition: opacity 0.15s;
        }
        .day-cell:hover .add-hint { opacity: 1; }

        /* Modal */
        .modal-backdrop {
          position: fixed; inset: 0;
          background: rgba(26, 22, 18, 0.5);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 100;
          padding: 20px;
          animation: fadeIn 0.2s ease;
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .modal {
          background: var(--bg-card);
          border-radius: 8px;
          max-width: 640px;
          width: 100%;
          max-height: 88vh;
          overflow-y: auto;
          border: 1px solid var(--line);
          box-shadow: 0 24px 60px rgba(26,22,18,0.25);
          animation: slideUp 0.25s ease;
        }
        @keyframes slideUp { from { transform: translateY(16px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .modal-head {
          padding: 24px 28px 20px;
          border-bottom: 1px solid var(--line-soft);
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }
        .modal-head h2 {
          font-family: 'Fraunces', serif;
          font-weight: 500;
          font-size: 26px;
          margin: 0;
          letter-spacing: -0.01em;
        }
        .modal-head p { margin: 6px 0 0; font-size: 13px; color: var(--ink-soft); }
        .modal-close {
          background: transparent;
          border: none;
          cursor: pointer;
          color: var(--ink-mute);
          padding: 4px;
          border-radius: 4px;
          transition: all 0.15s;
        }
        .modal-close:hover { background: var(--line-soft); color: var(--ink); }

        .modal-body { padding: 22px 28px 28px; }

        .room-section { margin-bottom: 22px; }
        .room-section:last-of-type { margin-bottom: 0; }
        .room-section-head {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 10px;
        }
        .room-section-dot {
          width: 10px; height: 10px;
          border-radius: 50%;
        }
        .room-section[data-room="praksisrom"] .room-section-dot { background: var(--rust); }
        .room-section[data-room="omsorgsleilighet"] .room-section-dot { background: var(--sage); }
        .room-section h3 {
          font-family: 'Fraunces', serif;
          font-size: 19px;
          font-weight: 500;
          margin: 0;
          letter-spacing: -0.005em;
        }

        .booking-list { display: flex; flex-direction: column; gap: 8px; }
        .booking-row {
          display: flex;
          gap: 14px;
          padding: 14px 16px;
          background: var(--bg);
          border-radius: 6px;
          border-left: 3px solid var(--ink-mute);
          align-items: center;
        }
        .booking-row[data-room="praksisrom"] { border-left-color: var(--rust); }
        .booking-row[data-room="omsorgsleilighet"] { border-left-color: var(--sage); }
        .booking-row-main { flex: 1; min-width: 0; }
        .booking-row-top {
          display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap;
          margin-bottom: 4px;
        }
        .booking-row-slot {
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--ink-soft);
          background: var(--bg-card);
          padding: 3px 8px;
          border-radius: 3px;
        }
        .booking-row-time { font-size: 12px; color: var(--ink-mute); font-feature-settings: "tnum"; }
        .booking-row-class {
          font-family: 'Fraunces', serif;
          font-size: 17px;
          font-weight: 500;
          letter-spacing: -0.005em;
        }
        .booking-row-teacher { font-size: 13px; color: var(--ink-soft); }
        .booking-row-teacher::before { content: "→ "; color: var(--ink-mute); }
        .delete-btn {
          background: transparent;
          border: 1px solid var(--line);
          color: var(--ink-mute);
          width: 34px; height: 34px;
          display: flex; align-items: center; justify-content: center;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.15s;
        }
        .delete-btn:hover { color: var(--rust); border-color: var(--rust); background: var(--rust-soft); }

        .empty-state {
          padding: 14px 16px;
          color: var(--ink-mute);
          font-size: 13px;
          background: var(--bg);
          border-radius: 6px;
          border: 1px dashed var(--line);
          font-style: italic;
          font-family: 'Fraunces', serif;
        }

        .new-booking-btn {
          margin-top: 18px;
          width: 100%;
          padding: 14px;
          background: var(--ink);
          color: var(--bg);
          border: none;
          border-radius: 6px;
          font-family: inherit;
          font-size: 14px;
          font-weight: 500;
          letter-spacing: 0.02em;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: all 0.15s;
        }
        .new-booking-btn:hover { background: var(--rust); }

        .form-section {
          margin-top: 18px;
          padding-top: 22px;
          border-top: 1px solid var(--line-soft);
        }
        .form-section h3 {
          font-family: 'Fraunces', serif;
          font-size: 18px;
          font-weight: 500;
          margin: 0 0 16px;
        }
        .field { margin-bottom: 14px; }
        .field label {
          display: block;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--ink-soft);
          margin-bottom: 6px;
        }
        .field input {
          width: 100%;
          padding: 10px 12px;
          font-family: inherit;
          font-size: 14px;
          color: var(--ink);
          background: var(--bg);
          border: 1px solid var(--line);
          border-radius: 4px;
          outline: none;
          transition: border-color 0.15s;
        }
        .field input:focus { border-color: var(--ink); }

        .picker-grid {
          display: grid;
          gap: 8px;
        }
        .picker-grid.cols-2 { grid-template-columns: repeat(2, 1fr); }
        .picker-grid.cols-3 { grid-template-columns: repeat(3, 1fr); }
        .picker-option {
          padding: 12px 10px;
          background: var(--bg);
          border: 1px solid var(--line);
          border-radius: 4px;
          cursor: pointer;
          text-align: center;
          transition: all 0.15s;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        }
        .picker-option:hover:not(.disabled) { border-color: var(--ink-soft); }
        .picker-option.active {
          background: var(--ink);
          color: var(--bg);
          border-color: var(--ink);
        }
        .picker-option.disabled {
          opacity: 0.35;
          cursor: not-allowed;
          background: var(--line-soft);
        }
        .picker-option-label { font-weight: 600; font-size: 13px; }
        .picker-option-meta { font-size: 11px; opacity: 0.7; font-feature-settings: "tnum"; }
        .picker-option-dot {
          width: 8px; height: 8px; border-radius: 50%;
          margin-bottom: 2px;
        }

        .form-actions {
          display: flex;
          gap: 10px;
          margin-top: 18px;
        }
        .btn-primary, .btn-secondary {
          padding: 12px 20px;
          font-family: inherit;
          font-size: 14px;
          font-weight: 500;
          border-radius: 4px;
          cursor: pointer;
          border: 1px solid transparent;
          transition: all 0.15s;
        }
        .btn-primary {
          background: var(--ink);
          color: var(--bg);
          flex: 1;
        }
        .btn-primary:hover { background: var(--rust); }
        .btn-secondary {
          background: transparent;
          border-color: var(--line);
          color: var(--ink-soft);
        }
        .btn-secondary:hover { background: var(--bg); color: var(--ink); }

        .form-error {
          display: flex;
          gap: 8px;
          padding: 10px 12px;
          background: var(--rust-soft);
          color: var(--rust);
          border-radius: 4px;
          font-size: 13px;
          margin-bottom: 12px;
          align-items: flex-start;
        }

        .toast {
          position: fixed;
          bottom: 30px;
          left: 50%;
          transform: translateX(-50%);
          background: var(--ink);
          color: var(--bg);
          padding: 12px 20px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          z-index: 200;
          box-shadow: 0 8px 24px rgba(0,0,0,0.2);
          animation: toastIn 0.25s ease;
        }
        @keyframes toastIn { from { transform: translate(-50%, 20px); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
        .toast.error { background: var(--rust); }

        .loading {
          text-align: center;
          padding: 80px 20px;
          color: var(--ink-mute);
          font-family: 'Fraunces', serif;
          font-style: italic;
          font-size: 18px;
        }

        @media (max-width: 768px) {
          .booking-app { padding: 20px 14px 60px; }
          .header { flex-direction: column; align-items: flex-start; gap: 14px; }
          .header-title h1 { font-size: 32px; }
          .header-meta { text-align: left; }
          .calendar-grid { grid-template-columns: 32px repeat(5, 1fr); }
          .day-cell { min-height: 110px; padding: 6px 6px 6px 8px; }
          .day-num { font-size: 14px; }
          .booking-chip { font-size: 10px; }
          .booking-chip-class { font-size: 10px; }
          .booking-chip-teacher { display: none; }
          .calendar-month { font-size: 22px; }
          .calendar-toolbar { padding: 16px 18px; }
          .picker-grid.cols-3 { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="container">
        <header className="header">
          <div className="header-title">
            <h1>Praksisrom <em>helsefag</em></h1>
            <p>Booking av praksisrom og omsorgsleilighet</p>
          </div>
          <div className="header-meta">
            Skoleåret
            <strong>2026 / 2027</strong>
          </div>
        </header>

        <div className="filter-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span className="filter-label">Vis</span>
            <div className="room-filter">
              <button
                className={`filter-btn ${roomFilter === 'alle' ? 'active' : ''}`}
                data-room="alle"
                onClick={() => setRoomFilter('alle')}
              >
                <span className="filter-btn-dot" />
                Begge rom
              </button>
              <button
                className={`filter-btn ${roomFilter === 'praksisrom' ? 'active' : ''}`}
                data-room="praksisrom"
                onClick={() => setRoomFilter('praksisrom')}
              >
                <span className="filter-btn-dot" />
                Praksisrom
              </button>
              <button
                className={`filter-btn ${roomFilter === 'omsorgsleilighet' ? 'active' : ''}`}
                data-room="omsorgsleilighet"
                onClick={() => setRoomFilter('omsorgsleilighet')}
              >
                <span className="filter-btn-dot" />
                Omsorgsleilighet
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
            <div className="legend">
              <div className="legend-group">
                <div className="legend-block" style={{ background: 'var(--rust-soft)' }} />
                <span>Praksisrom</span>
              </div>
              <div className="legend-group">
                <div className="legend-block" style={{ background: 'var(--sage-soft)' }} />
                <span>Omsorgsleilighet</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="export-btn" onClick={() => setCalendarExport({ open: true })} title="Eksporter til Outlook/kalenderprogram">
                <Calendar size={14} />
                Til kalender
              </button>
              <label className="export-btn" style={{ cursor: 'pointer' }} title="Importer bookinger fra Excel-fil">
                <Upload size={14} />
                Importer
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileSelected}
                  style={{ display: 'none' }}
                />
              </label>
              <button className="export-btn" onClick={handleExport} title="Last ned alle bookinger som Excel-fil">
                <Download size={14} />
                Eksporter til Excel
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="calendar-shell">
            <div className="loading">Henter bookinger…</div>
          </div>
        ) : (
          <div className="calendar-shell">
            <div className="calendar-toolbar">
              <div className="calendar-month">
                {getMonthName(viewMonth.getMonth())} <em>{viewMonth.getFullYear()}</em>
              </div>
              <div className="nav-buttons">
                <button
                  className="nav-btn"
                  onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}
                  disabled={!canGoPrev}
                  aria-label="Forrige måned"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  className="nav-btn"
                  onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}
                  disabled={!canGoNext}
                  aria-label="Neste måned"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>

            <div className="calendar-grid">
              <div className="calendar-header-cell week-col">UKE</div>
              {['Mandag','Tirsdag','Onsdag','Torsdag','Fredag'].map(d => (
                <div key={d} className="calendar-header-cell">{d}</div>
              ))}

              {weekRows.map((row, ri) => {
                const weekdayCells = row.slice(0, 5);
                const firstDay = weekdayCells.find(d => d);
                const weekNum = firstDay ? getWeekNumber(firstDay) : '';
                return (
                  <React.Fragment key={ri}>
                    <div className="week-label">{weekNum}</div>
                    {weekdayCells.map((d, di) => {
                      if (!d) return <div key={di} className="day-cell empty" />;
                      const inSchoolYear = d >= SCHOOL_YEAR_START && d <= SCHOOL_YEAR_END;
                      const schoolDay = isSchoolDay(d);
                      const bks = sortBookings(bookingsByDate[formatDate(d)] || []);
                      return (
                        <div
                          key={di}
                          className={`day-cell ${!schoolDay ? 'not-school' : ''}`}
                          onClick={() => schoolDay && openDayModal(d)}
                        >
                          <div className="day-num">{d.getDate()}</div>
                          {!inSchoolYear && <div className="day-meta">utenfor skoleår</div>}
                          {inSchoolYear && !schoolDay && <div className="day-meta">fri</div>}
                          {schoolDay && bks.map(b => {
                            const slot = SLOTS.find(s => s.id === b.slot);
                            const room = ROOMS.find(r => r.id === b.room);
                            return (
                              <div
                                key={b.id}
                                className="booking-chip"
                                data-room={b.room}
                                title={`${room.name} · ${slot.label} (${slot.time}) · ${b.class} · ${b.teacher}`}
                              >
                                <div className="booking-chip-bar" />
                                <div className="booking-chip-body">
                                  <div className="booking-chip-top">
                                    <span className="booking-chip-tag">{room.short}</span>
                                    <span className="booking-chip-slot">{slot.short} · {b.slot === 'heldag' ? 'hel' : b.slot.slice(0,3)}</span>
                                  </div>
                                  <div className="booking-chip-class">{b.class}</div>
                                  <div className="booking-chip-teacher">{b.teacher}</div>
                                </div>
                              </div>
                            );
                          })}
                          {schoolDay && (
                            <div className="add-hint"><Plus size={12} /></div>
                          )}
                        </div>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {modalDate && (
        <div className="modal-backdrop" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>
                  {getWeekdayShort(modalDate.getDay()).charAt(0).toUpperCase() + getWeekdayShort(modalDate.getDay()).slice(1)}.
                  {' '}{modalDate.getDate()}. {getMonthName(modalDate.getMonth())}
                </h2>
                <p>uke {getWeekNumber(modalDate)} · {modalDate.getFullYear()}</p>
              </div>
              <button className="modal-close" onClick={closeModal} aria-label="Lukk">
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              {ROOMS.map(room => {
                const bks = dayBookingsForRoom(modalDate, room.id).sort((a, b) => {
                  const order = { formiddag: 0, heldag: 1, ettermiddag: 2 };
                  return order[a.slot] - order[b.slot];
                });
                return (
                  <div key={room.id} className="room-section" data-room={room.id}>
                    <div className="room-section-head">
                      <div className="room-section-dot" />
                      <h3>{room.name}</h3>
                    </div>
                    {bks.length === 0 ? (
                      <div className="empty-state">Ingen bookinger.</div>
                    ) : (
                      <div className="booking-list">
                        {bks.map(b => {
                          const slot = SLOTS.find(s => s.id === b.slot);
                          return (
                            <div key={b.id} className="booking-row" data-room={b.room}>
                              <div className="booking-row-main">
                                <div className="booking-row-top">
                                  <span className="booking-row-slot">{slot.label}</span>
                                  <span className="booking-row-time">{slot.time}</span>
                                </div>
                                <div className="booking-row-class">{b.class}</div>
                                <div className="booking-row-teacher">{b.teacher}</div>
                              </div>
                              <button
                                className="delete-btn"
                                onClick={() => handleDelete(b)}
                                aria-label="Slett booking"
                                title="Slett booking"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {!showForm && (
                <button className="new-booking-btn" onClick={() => setShowForm(true)}>
                  <Plus size={16} /> Ny booking
                </button>
              )}

              {showForm && (
                <div className="form-section">
                  <h3>Ny booking</h3>

                  {formError && (
                    <div className="form-error">
                      <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                      <span>{formError}</span>
                    </div>
                  )}

                  <div className="field">
                    <label>Rom</label>
                    <div className="picker-grid cols-2">
                      {ROOMS.map(r => (
                        <div
                          key={r.id}
                          className={`picker-option ${formData.room === r.id ? 'active' : ''}`}
                          onClick={() => setFormData(f => ({ ...f, room: r.id }))}
                        >
                          <div className="picker-option-dot" style={{ background: r.color }} />
                          <div className="picker-option-label">{r.name}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="field">
                    <label>Tidspunkt</label>
                    <div className="picker-grid cols-3">
                      {SLOTS.map(s => {
                        const existing = dayBookingsForRoom(modalDate, formData.room);
                        const disabled = existing.some(b => slotsConflict(b.slot, s.id));
                        return (
                          <div
                            key={s.id}
                            className={`picker-option ${formData.slot === s.id ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
                            onClick={() => !disabled && setFormData(f => ({ ...f, slot: s.id }))}
                          >
                            <div className="picker-option-label">{s.label}</div>
                            <div className="picker-option-meta">{s.time}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="field">
                    <label htmlFor="class-input">Klasse</label>
                    <input
                      id="class-input"
                      type="text"
                      placeholder="f.eks. 2HEA"
                      value={formData.class}
                      onChange={e => setFormData(f => ({ ...f, class: e.target.value }))}
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="teacher-input">Lærer</label>
                    <input
                      id="teacher-input"
                      type="text"
                      placeholder="f.eks. Kari Nordmann"
                      value={formData.teacher}
                      onChange={e => setFormData(f => ({ ...f, teacher: e.target.value }))}
                    />
                  </div>

                  <div className="form-actions">
                    <button
                      className="btn-secondary"
                      onClick={() => { setShowForm(false); setFormError(''); }}
                    >
                      Avbryt
                    </button>
                    <button className="btn-primary" onClick={handleBook}>
                      Lagre booking
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {calendarExport && (
        <div className="modal-backdrop" onClick={() => setCalendarExport(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>Eksporter til kalender</h2>
                <p>Last ned en .ics-fil som kan åpnes i Outlook, Google Kalender eller Apple Kalender</p>
              </div>
              <button className="modal-close" onClick={() => setCalendarExport(null)} aria-label="Lukk">
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div className="cal-info">
                <Calendar size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                <div>
                  <strong>Slik bruker du fila i Outlook:</strong> Dobbeltklikk .ics-fila etter nedlasting,
                  så åpner Outlook den og spør om du vil legge til avtalene i kalenderen din.
                </div>
              </div>

              <div className="cal-section">
                <h4>Alle bookinger</h4>
                <button
                  className="cal-option"
                  onClick={() => handleCalendarExport('all')}
                  disabled={bookings.length === 0}
                >
                  <div className="cal-option-icon"><Calendar size={18} /></div>
                  <div className="cal-option-body">
                    <div className="cal-option-title">Hele kalenderen</div>
                    <div className="cal-option-meta">{bookings.length} bookinger fra begge rom</div>
                  </div>
                  <Download size={16} className="cal-option-arrow" />
                </button>
              </div>

              <div className="cal-section">
                <h4>Filtrert på rom</h4>
                <div className="cal-options-grid">
                  {ROOMS.map(r => {
                    const count = bookings.filter(b => b.room === r.id).length;
                    return (
                      <button
                        key={r.id}
                        className="cal-option"
                        onClick={() => handleCalendarExport('room', r.id)}
                        disabled={count === 0}
                      >
                        <div className="cal-option-icon" data-room={r.id}>
                          <div className="cal-option-dot" />
                        </div>
                        <div className="cal-option-body">
                          <div className="cal-option-title">{r.name}</div>
                          <div className="cal-option-meta">{count} bookinger</div>
                        </div>
                        <Download size={16} className="cal-option-arrow" />
                      </button>
                    );
                  })}
                </div>
              </div>

              {uniqueTeachers.length > 0 && (
                <div className="cal-section">
                  <h4>Filtrert på lærer</h4>
                  <p className="import-section-help">Hver lærer kan abonnere på sin egen kalender — perfekt for personlig oversikt.</p>
                  <div className="cal-teacher-list">
                    {uniqueTeachers.map(t => {
                      const count = bookings.filter(b => b.teacher === t).length;
                      return (
                        <button
                          key={t}
                          className="cal-option cal-option-compact"
                          onClick={() => handleCalendarExport('teacher', t)}
                        >
                          <div className="cal-option-body">
                            <div className="cal-option-title">{t}</div>
                            <div className="cal-option-meta">{count} bookinger</div>
                          </div>
                          <Download size={14} className="cal-option-arrow" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {importPreview && (
        <div className="modal-backdrop" onClick={cancelImport}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>Bekreft import</h2>
                <p>Gjennomgang av Excel-fil før import</p>
              </div>
              <button className="modal-close" onClick={cancelImport} aria-label="Lukk">
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div className="import-summary">
                <div className="import-stat import-stat-ok">
                  <div className="import-stat-num">{importPreview.newRows.length}</div>
                  <div className="import-stat-label">Nye bookinger blir lagt til</div>
                </div>
                <div className="import-stat import-stat-warn">
                  <div className="import-stat-num">{importPreview.duplicates.length}</div>
                  <div className="import-stat-label">Duplikater hoppes over</div>
                </div>
                <div className="import-stat import-stat-error">
                  <div className="import-stat-num">{importPreview.errors.length}</div>
                  <div className="import-stat-label">Rader med feil</div>
                </div>
              </div>

              {importPreview.newRows.length > 0 && (
                <div className="import-section">
                  <h4>Nye bookinger ({importPreview.newRows.length})</h4>
                  <div className="import-list">
                    {importPreview.newRows.slice(0, 8).map((r, i) => (
                      <div key={i} className="import-item import-item-ok">
                        <span className="import-item-date">{r.date}</span>
                        <span className="import-item-room" data-room={r.room}>
                          {r.room === 'praksisrom' ? 'PR' : 'OL'}
                        </span>
                        <span>{r.slot === 'heldag' ? 'Hel dag' : r.slot.charAt(0).toUpperCase() + r.slot.slice(1)}</span>
                        <span className="import-item-meta">{r.class} · {r.teacher}</span>
                      </div>
                    ))}
                    {importPreview.newRows.length > 8 && (
                      <div className="import-more">+ {importPreview.newRows.length - 8} flere…</div>
                    )}
                  </div>
                </div>
              )}

              {importPreview.duplicates.length > 0 && (
                <div className="import-section">
                  <h4>Duplikater ({importPreview.duplicates.length})</h4>
                  <p className="import-section-help">Disse finnes allerede, eller kolliderer med eksisterende bookinger.</p>
                  <div className="import-list">
                    {importPreview.duplicates.slice(0, 5).map((r, i) => (
                      <div key={i} className="import-item import-item-warn">
                        <span className="import-item-date">{r.date}</span>
                        <span className="import-item-room" data-room={r.room}>
                          {r.room === 'praksisrom' ? 'PR' : 'OL'}
                        </span>
                        <span>{r.slot === 'heldag' ? 'Hel dag' : r.slot.charAt(0).toUpperCase() + r.slot.slice(1)}</span>
                      </div>
                    ))}
                    {importPreview.duplicates.length > 5 && (
                      <div className="import-more">+ {importPreview.duplicates.length - 5} flere…</div>
                    )}
                  </div>
                </div>
              )}

              {importPreview.errors.length > 0 && (
                <div className="import-section">
                  <h4>Feil ({importPreview.errors.length})</h4>
                  <p className="import-section-help">Disse radene kan ikke importeres.</p>
                  <div className="import-list">
                    {importPreview.errors.slice(0, 5).map((err, i) => (
                      <div key={i} className="import-item import-item-error">{err}</div>
                    ))}
                    {importPreview.errors.length > 5 && (
                      <div className="import-more">+ {importPreview.errors.length - 5} flere…</div>
                    )}
                  </div>
                </div>
              )}

              <div className="form-actions">
                <button className="btn-secondary" onClick={cancelImport} disabled={importing}>
                  Avbryt
                </button>
                <button
                  className="btn-primary"
                  onClick={confirmImport}
                  disabled={importing || importPreview.newRows.length === 0}
                >
                  {importing ? 'Importerer…' : `Importer ${importPreview.newRows.length} bookinger`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`toast ${toast.type === 'error' ? 'error' : ''}`}>
          {toast.type === 'error' ? <AlertCircle size={16} /> : <Check size={16} />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}
