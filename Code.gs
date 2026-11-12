/**
 * Tenang BC — Senarai hadir badminton (Google Apps Script web app)
 *
 * Fail: Code.gs (pelayan) + Index.html (paparan)
 * Sekali sahaja: jalankan setup() dari editor, kemudian Deploy > Web app.
 *
 * Nota: fungsi yang namanya berakhir dengan "_" adalah peribadi dan
 * TIDAK boleh dipanggil dari pelayar. Jangan buang "_" itu.
 */

// ====================== TETAPAN ======================
var CONFIG = {
  CLUB_NAME: 'Tenang BC',
  MAX_PLAYERS: 18,            // lebih daripada ini -> senarai menunggu
  MAX_GUESTS: 3,              // tetamu maksimum bagi setiap pemain
  INITIAL_PIN: '1234',        // PIN admin permulaan (tukar selepas deploy!)
  DEFAULT_WEEKDAY: 0,         // 0=Ahad, 1=Isnin, ... 6=Sabtu
  DEFAULT_TIME: '9 pagi - 11 pagi',
  DEFAULT_VENUE: 'K Six Badminton Arena',
  DEFAULT_MAP: 'https://maps.app.goo.gl/Hio1sbaAr6sKshK77?g_st=ic',
  DEFAULT_SHUTTLE_PRICE: 12,  // RM setiap shuttle
  TIMEZONE: 'Asia/Kuala_Lumpur',
  COURT_TIERS: [[7, 1], [12, 2], [18, 3]], // [bil. pemain maksimum, bil. court]
  PIN_MAX_FAILS: 10,          // PIN salah sebelum dikunci
  PIN_LOCK_SECONDS: 600,      // tempoh kunci (10 minit)
  APP_URL: 'https://tinyurl.com/tenangbc'               // pilihan: tampal pautan /exec di sini jika pautan dalam teks WhatsApp salah
};
// =====================================================

var SH = { S: 'Sesi', P: 'Pemain', D: 'TarikDiri' };
var HEAD = {
  Sesi: ['ID', 'Tarikh', 'Masa', 'Tempat', 'Peta', 'Status', 'Sewa court (RM)', 'Bil. shuttle', 'Harga shuttle (RM)', 'Dicipta'],
  Pemain: ['ID', 'Sesi', 'Nama', 'Telefon', 'DeviceID', 'Tetamu kepada (ID)', 'Masa daftar', 'Bayar', 'Sumber'],
  TarikDiri: ['Sesi', 'Nama', 'Masa', 'Cara', 'Selepas TUTUP']
};
var HARI = ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'];
var MSG_CLOSED = 'Senarai sudah ditutup. Hubungi admin.';

// ====================== WEB APP ======================

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle(CONFIG.CLUB_NAME + ' — Minton')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Jalankan SEKALI dari editor (pilih "setup" > Run).
 * Selamat dijalankan semula: tidak memadam data dan tidak menukar PIN sedia ada.
 */
function setup() {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var props = PropertiesService.getScriptProperties();
    var id = props.getProperty('SHEET_ID');
    var ss;
    if (id) {
      ss = SpreadsheetApp.openById(id);
    } else {
      ss = SpreadsheetApp.getActiveSpreadsheet();
      if (!ss) throw new Error('Buka skrip ini dari Google Sheet: Extensions > Apps Script.');
      props.setProperty('SHEET_ID', ss.getId());
    }
    if (!props.getProperty('ADMIN_PIN')) props.setProperty('ADMIN_PIN', CONFIG.INITIAL_PIN);
    ss.setSpreadsheetTimeZone(CONFIG.TIMEZONE);

    [SH.S, SH.P, SH.D].forEach(function (name) {
      var sh = ss.getSheetByName(name);
      if (!sh) sh = ss.insertSheet(name);
      var head = HEAD[name];
      sh.getRange(1, 1, sh.getMaxRows(), head.length).setNumberFormat('@');
      if (sh.getLastRow() < 1) {
        sh.getRange(1, 1, 1, head.length).setValues([head.map(txt_)]).setFontWeight('bold');
        sh.setFrozenRows(1);
      }
    });

    if (!getSessions_(ss).length) {
      createSession_(ss, {
        date: nextDefaultDate_(),
        time: CONFIG.DEFAULT_TIME,
        venue: CONFIG.DEFAULT_VENUE,
        map: CONFIG.DEFAULT_MAP,
        price: centsText_(CONFIG.DEFAULT_SHUTTLE_PRICE * 100)
      });
    }
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  Logger.log('Siap! Sekarang: Deploy > New deployment > Web app.');
}

// ====================== API AWAM (tanpa login) ======================

function getState(deviceId) {
  return run_(function () {
    var ss = getSs_();
    return { ok: true, state: buildState_(ss, cleanDevice_(deviceId), false) };
  });
}

function join(deviceId, name, phone) {
  return write_(function (ss) {
    var dev = needDevice_(deviceId);
    var s = currentSession_(ss);
    var nm = validName_(name);
    var ph = validPhone_(phone);
    var ps = sessionPlayers_(ss, s.id);
    ps.forEach(function (p) {
      if (p.device === dev && !p.guestOf) throw userErr_('Telefon ini sudah berdaftar sebagai "' + p.name + '".');
    });
    // Pelayar "terlupa" pemain ini? Nama + no. telefon yang sama -> sambung semula ke nama sedia ada.
    if (claimEntry_(ss, ps, dev, nm, ph)) {
      return { ok: true, claimed: true, state: buildState_(ss, dev, false) };
    }
    if (s.status !== 'OPEN') throw userErr_(MSG_CLOSED);
    dupCheck_(ps, nm, '', ' Jika ini anda, isi no. telefon yang sama seperti semasa daftar, atau hubungi admin.');
    appendRow_(ss.getSheetByName(SH.P), [newId_(), s.id, nm, ph, dev, '', now_(), '', 'sendiri']);
    return { ok: true, state: buildState_(ss, dev, false) };
  });
}

/** Sambung semula nama sedia ada ke peranti ini (juga dibenarkan selepas TUTUP, supaya boleh tarik diri). */
function reclaim(deviceId, name, phone) {
  return write_(function (ss) {
    var dev = needDevice_(deviceId);
    var s = currentSession_(ss);
    var nm = validName_(name);
    var ph = validPhone_(phone);
    var ps = sessionPlayers_(ss, s.id);
    ps.forEach(function (p) {
      if (p.device === dev && !p.guestOf) throw userErr_('Telefon ini sudah berdaftar sebagai "' + p.name + '".');
    });
    if (!claimEntry_(ss, ps, dev, nm, ph)) {
      throw userErr_('Nama & no. telefon tidak sepadan dengan senarai. Hubungi admin.');
    }
    return { ok: true, claimed: true, state: buildState_(ss, dev, false) };
  });
}

function addGuest(deviceId, name) {
  return write_(function (ss) {
    var dev = needDevice_(deviceId);
    var s = currentSession_(ss);
    if (s.status !== 'OPEN') throw userErr_(MSG_CLOSED);
    var nm = validName_(name);
    var ps = sessionPlayers_(ss, s.id);
    var host = null, guests = 0;
    ps.forEach(function (p) {
      if (p.device !== dev) return;
      if (p.guestOf) guests++; else host = p;
    });
    if (!host) throw userErr_('Sila daftar nama anda dahulu sebelum menambah tetamu.');
    if (guests >= CONFIG.MAX_GUESTS) throw userErr_('Maksimum ' + CONFIG.MAX_GUESTS + ' tetamu sahaja.');
    dupCheck_(ps, nm, '');
    appendRow_(ss.getSheetByName(SH.P), [newId_(), s.id, nm, '', dev, host.id, now_(), '', 'sendiri']);
    return { ok: true, state: buildState_(ss, dev, false) };
  });
}

function withdraw(deviceId, playerId) {
  return write_(function (ss) {
    var dev = needDevice_(deviceId);
    var s = currentSession_(ss);
    var ps = sessionPlayers_(ss, s.id);
    var target = findPlayer_(ps, playerId);
    // Semakan pemilikan dibuat di pelayan: hanya peranti yang mendaftar boleh tarik diri.
    if (!target || target.device !== dev) throw userErr_('Anda hanya boleh tarik diri nama anda sendiri.');
    removePlayers_(ss, s, withGuests_(ps, target), 'tarik diri sendiri');
    return { ok: true, state: buildState_(ss, dev, false) };
  });
}

// ====================== API ADMIN (PIN disemak di pelayan setiap kali) ======================
// auth = { pin: '....', deviceId: '....' }

function adminGetState(auth) {
  return admin_(auth, function () {});
}

function adminSetStatus(auth, status) {
  return admin_(auth, function (ss) {
    if (status !== 'OPEN' && status !== 'CLOSED') throw userErr_('Status tidak sah.');
    var s = currentSession_(ss);
    ss.getSheetByName(SH.S).getRange(s.row, 6).setValue(txt_(status));
  });
}

function adminSaveSession(auth, data) {
  return admin_(auth, function (ss) {
    var d = validSession_(data);
    var s = currentSession_(ss);
    ss.getSheetByName(SH.S).getRange(s.row, 2, 1, 4)
      .setValues([[d.date, d.time, d.venue, d.map].map(txt_)]);
  });
}

function adminNewSession(auth, data) {
  return admin_(auth, function (ss) {
    var d = validSession_(data);
    var prev = currentSession_(ss);
    d.price = centsText_(cents_(prev.price) || CONFIG.DEFAULT_SHUTTLE_PRICE * 100);
    createSession_(ss, d);
  });
}

function adminAddPlayer(auth, name, phone) {
  return admin_(auth, function (ss) {
    var nm = validName_(name);
    var ph = validPhone_(phone);
    var s = currentSession_(ss);
    dupCheck_(sessionPlayers_(ss, s.id), nm, '');
    appendRow_(ss.getSheetByName(SH.P), [newId_(), s.id, nm, ph, '', '', now_(), '', 'admin']);
  });
}

function adminEditPlayer(auth, playerId, name, phone) {
  return admin_(auth, function (ss) {
    var s = currentSession_(ss);
    var ps = sessionPlayers_(ss, s.id);
    var p = findPlayer_(ps, playerId);
    if (!p) throw userErr_('Pemain tidak dijumpai.');
    var nm = validName_(name);
    var ph = p.guestOf ? '' : validPhone_(phone);
    dupCheck_(ps, nm, p.id);
    ss.getSheetByName(SH.P).getRange(p.row, 3, 1, 2).setValues([[txt_(nm), txt_(ph)]]);
  });
}

function adminRemovePlayer(auth, playerId) {
  return admin_(auth, function (ss) {
    var s = currentSession_(ss);
    var ps = sessionPlayers_(ss, s.id);
    var p = findPlayer_(ps, playerId);
    if (!p) throw userErr_('Pemain tidak dijumpai.');
    removePlayers_(ss, s, withGuests_(ps, p), 'dibuang admin');
  });
}

function adminSetPaid(auth, playerId, paid) {
  return admin_(auth, function (ss) {
    var s = currentSession_(ss);
    var p = findPlayer_(sessionPlayers_(ss, s.id), playerId);
    if (!p) throw userErr_('Pemain tidak dijumpai.');
    ss.getSheetByName(SH.P).getRange(p.row, 8).setValue(txt_(paid === true ? 'YA' : ''));
  });
}

function adminSaveFees(auth, fees) {
  return admin_(auth, function (ss) {
    fees = fees || {};
    var court = moneyToCents_(fees.court);
    var price = moneyToCents_(fees.price);
    var sh = String(fees.shuttles == null ? '' : fees.shuttles).trim();
    if (sh === '') sh = '0';
    if (!/^\d{1,2}$/.test(sh)) throw userErr_('Bilangan shuttle tidak sah (0–99).');
    var s = currentSession_(ss);
    ss.getSheetByName(SH.S).getRange(s.row, 7, 1, 3)
      .setValues([[centsText_(court), String(Number(sh)), centsText_(price)].map(txt_)]);
  });
}

function adminChangePin(auth, newPin) {
  return admin_(auth, function () {
    var np = String(newPin == null ? '' : newPin);
    if (!/^\d{4,8}$/.test(np)) throw userErr_('PIN mesti 4–8 digit.');
    PropertiesService.getScriptProperties().setProperty('ADMIN_PIN', np);
  });
}

// ====================== PEMBANTU: aliran & keselamatan ======================

function userErr_(msg, code) {
  var e = new Error(msg);
  e.isUser = true;
  e.code = code || '';
  return e;
}

function run_(fn) {
  try {
    return fn();
  } catch (e) {
    if (e && e.isUser) return { ok: false, error: e.message, code: e.code };
    console.error(e && e.stack ? e.stack : e);
    return { ok: false, error: 'Ralat pelayan. Sila cuba lagi.' };
  }
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    throw userErr_('Sistem sibuk. Sila cuba lagi sebentar.');
  }
  try {
    var out = fn();
    SpreadsheetApp.flush();
    return out;
  } finally {
    lock.releaseLock();
  }
}

function write_(fn) {
  return run_(function () {
    return withLock_(function () { return fn(getSs_()); });
  });
}

function admin_(auth, fn) {
  return run_(function () {
    return withLock_(function () {
      checkPin_(auth);
      var ss = getSs_();
      fn(ss);
      return { ok: true, state: buildState_(ss, cleanDevice_(auth && auth.deviceId), true) };
    });
  });
}

function checkPin_(auth) {
  var cache = CacheService.getScriptCache();
  var lockMsg = 'Terlalu banyak PIN salah. Akses admin dikunci selama 10 minit.';
  if (cache.get('PIN_LOCK')) throw userErr_(lockMsg, 'LOCK');
  var pin = String((auth && auth.pin) || '');
  var real = PropertiesService.getScriptProperties().getProperty('ADMIN_PIN');
  if (!real || pin !== real) {
    var n = Number(cache.get('PIN_FAIL') || 0) + 1;
    if (n >= CONFIG.PIN_MAX_FAILS) {
      cache.put('PIN_LOCK', '1', CONFIG.PIN_LOCK_SECONDS);
      cache.remove('PIN_FAIL');
      throw userErr_(lockMsg, 'LOCK');
    }
    cache.put('PIN_FAIL', String(n), CONFIG.PIN_LOCK_SECONDS);
    throw userErr_('PIN salah.', 'PIN');
  }
  cache.remove('PIN_FAIL');
}

// ====================== PEMBANTU: pengesahan input ======================

function cleanDevice_(deviceId) {
  var d = String(deviceId == null ? '' : deviceId);
  return /^[A-Za-z0-9_-]{16,64}$/.test(d) ? d : '';
}

function needDevice_(deviceId) {
  var d = cleanDevice_(deviceId);
  if (!d) throw userErr_('ID peranti tidak sah. Sila muat semula halaman.');
  return d;
}

function validName_(name) {
  var n = String(name == null ? '' : name).replace(/\s+/g, ' ').trim();
  if (!n) throw userErr_('Sila isi nama.');
  if (n.length > 30) throw userErr_('Nama terlalu panjang (maksimum 30 aksara).');
  return n;
}

function validPhone_(phone) {
  var p = String(phone == null ? '' : phone).replace(/[\s\-+().]/g, '');
  if (!p) return '';
  if (!/^\d{9,15}$/.test(p)) throw userErr_('No. telefon tidak sah (9–15 digit).');
  return p;
}

function validDate_(date) {
  var d = String(date == null ? '' : date);
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (m) {
    var t = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    if (t.getUTCFullYear() === +m[1] && t.getUTCMonth() === +m[2] - 1 && t.getUTCDate() === +m[3]) return d;
  }
  throw userErr_('Tarikh tidak sah.');
}

function validSession_(data) {
  data = data || {};
  var time = String(data.time == null ? '' : data.time).replace(/\s+/g, ' ').trim();
  var venue = String(data.venue == null ? '' : data.venue).replace(/\s+/g, ' ').trim();
  var map = String(data.map == null ? '' : data.map).trim();
  if (!time || time.length > 40) throw userErr_('Sila isi masa (maksimum 40 aksara).');
  if (!venue || venue.length > 60) throw userErr_('Sila isi tempat (maksimum 60 aksara).');
  if (map && (!/^https:\/\/[^\s"'<>]+$/.test(map) || map.length > 300)) {
    throw userErr_('Pautan Google Maps mesti bermula dengan https://');
  }
  return { date: validDate_(data.date), time: time, venue: venue, map: map };
}

function moneyToCents_(v) {
  var s = String(v == null ? '' : v).trim().replace(',', '.');
  if (s === '') return 0;
  var m = /^(\d{1,5})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) throw userErr_('Jumlah RM tidak sah.');
  var frac = m[2] || '';
  while (frac.length < 2) frac += '0';
  return parseInt(m[1], 10) * 100 + parseInt(frac, 10);
}

/** Baca wang dari Sheet tanpa ralat (jika sel disunting tangan dan rosak -> 0). */
function cents_(v) {
  try { return moneyToCents_(v); } catch (e) { return 0; }
}

function centsText_(c) {
  var f = c % 100;
  return Math.floor(c / 100) + '.' + (f < 10 ? '0' : '') + f;
}

function dupCheck_(players, name, exceptId, hint) {
  var key = name.toLowerCase();
  players.forEach(function (p) {
    if (p.id !== exceptId && p.name.toLowerCase() === key) {
      throw userErr_('Nama "' + name + '" sudah ada dalam senarai. Sila tambah satu huruf, cth. "Adib K".' + (hint || ''));
    }
  });
}

/** 0123456789 dan 60123456789 dianggap nombor yang sama. */
function phoneKey_(p) {
  return p.indexOf('60') === 0 ? p.slice(1) : p;
}

/**
 * Jika nama (pemain utama) DAN no. telefon sepadan dengan nama sedia ada,
 * pindahkan nama itu (dan tetamunya) ke peranti ini. Pulangkan true jika berjaya.
 * Nama tanpa no. telefon tidak boleh dituntut — admin perlu uruskan.
 */
function claimEntry_(ss, players, dev, name, phone) {
  if (!phone) return false;
  var key = name.toLowerCase(), match = null;
  players.forEach(function (p) {
    if (!p.guestOf && p.name.toLowerCase() === key) match = p;
  });
  if (!match || !match.phone || phoneKey_(match.phone) !== phoneKey_(phone)) return false;
  var sh = ss.getSheetByName(SH.P);
  withGuests_(players, match).forEach(function (p) {
    sh.getRange(p.row, 5).setValue(txt_(dev));
  });
  return true;
}

// ====================== PEMBANTU: Sheet ======================

function getSs_() {
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw userErr_('Aplikasi belum disediakan. Admin perlu jalankan setup().');
  return SpreadsheetApp.openById(id);
}

/** Setiap sel disimpan sebagai teks biasa: kekalkan 0 di depan & halang formula. */
function txt_(v) {
  return "'" + String(v == null ? '' : v);
}

function readRows_(sheet, width) {
  var last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, width).getDisplayValues();
}

function appendRow_(sheet, arr) {
  var row = sheet.getLastRow() + 1;
  if (row > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 50);
  sheet.getRange(row, 1, 1, arr.length).setNumberFormat('@').setValues([arr.map(txt_)]);
}

function getSessions_(ss) {
  var sh = ss.getSheetByName(SH.S);
  if (!sh) throw userErr_('Aplikasi belum disediakan. Admin perlu jalankan setup().');
  return readRows_(sh, HEAD.Sesi.length).map(function (r, i) {
    return {
      row: i + 2, id: r[0], date: r[1], time: r[2], venue: r[3], map: r[4],
      status: r[5] === 'CLOSED' ? 'CLOSED' : 'OPEN',
      court: r[6], shuttles: r[7], price: r[8]
    };
  }).filter(function (s) { return s.id !== ''; });
}

function currentSession_(ss) {
  var all = getSessions_(ss);
  if (!all.length) throw userErr_('Tiada sesi lagi. Admin perlu jalankan setup().');
  return all[all.length - 1];
}

function createSession_(ss, d) {
  var maxId = 0;
  getSessions_(ss).forEach(function (s) { maxId = Math.max(maxId, parseInt(s.id, 10) || 0); });
  appendRow_(ss.getSheetByName(SH.S),
    [maxId + 1, d.date, d.time, d.venue, d.map, 'OPEN', '', '', d.price, now_()]);
}

/** Pemain sesi ini, ikut susunan daftar (susunan baris = susunan masa). */
function sessionPlayers_(ss, sessionId) {
  var out = [];
  readRows_(ss.getSheetByName(SH.P), HEAD.Pemain.length).forEach(function (r, i) {
    if (r[0] === '' || r[1] !== sessionId) return;
    out.push({
      row: i + 2, id: r[0], name: r[2], phone: r[3], device: r[4],
      guestOf: r[5], paid: r[7] === 'YA', src: r[8]
    });
  });
  var byId = {};
  out.forEach(function (p) { byId[p.id] = p; });
  out.forEach(function (p) {
    if (!p.guestOf) { p.display = p.name; return; }
    var host = byId[p.guestOf];
    p.display = p.name + ' (tetamu' + (host ? ' ' + host.name : '') + ')';
  });
  return out;
}

function newId_() {
  return Utilities.getUuid().replace(/-/g, '').slice(0, 16);
}

function findPlayer_(players, id) {
  var key = String(id == null ? '' : id);
  if (!key) return null;
  for (var i = 0; i < players.length; i++) if (players[i].id === key) return players[i];
  return null;
}

/** Pemain + tetamunya (jika dia pemain utama). */
function withGuests_(players, target) {
  var list = [target];
  if (!target.guestOf) {
    players.forEach(function (p) { if (p.guestOf === target.id) list.push(p); });
  }
  return list;
}

function removePlayers_(ss, session, targets, how) {
  var after = session.status === 'CLOSED' ? 'YA' : '';
  var log = ss.getSheetByName(SH.D);
  targets.forEach(function (t) {
    appendRow_(log, [session.id, t.display, now_(), how, after]);
  });
  var sh = ss.getSheetByName(SH.P);
  targets.map(function (t) { return t.row; })
    .sort(function (a, b) { return b - a; })
    .forEach(function (row) {
      if (sh.getMaxRows() - sh.getFrozenRows() <= 1) sh.insertRowsAfter(sh.getMaxRows(), 1);
      sh.deleteRow(row);
    });
}

// ====================== PEMBANTU: tarikh, court, bayaran ======================

function now_() {
  return Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'dd/MM/yyyy HH:mm:ss');
}

function isoToUtc_(iso) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
}

function hari_(iso) {
  var d = isoToUtc_(iso);
  return d ? HARI[d.getUTCDay()] : '';
}

function displayDate_(iso) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? m[3] + '/' + m[2] + '/' + m[1] : iso;
}

/** Hari lalai (cth. Ahad) yang seterusnya selepas hari ini, waktu Malaysia. */
function nextDefaultDate_() {
  var today = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd');
  var d = isoToUtc_(today);
  do {
    d = new Date(d.getTime() + 86400000);
  } while (d.getUTCDay() !== CONFIG.DEFAULT_WEEKDAY);
  return d.toISOString().slice(0, 10);
}

function courts_(n) {
  var t = CONFIG.COURT_TIERS;
  for (var i = 0; i < t.length; i++) if (n <= t[i][0]) return t[i][1];
  return t[t.length - 1][1];
}

/** Pembahagian integer dibundarkan ke atas (tiada ralat titik apungan). */
function ceilDiv_(a, b) {
  var r = a % b;
  return (a - r) / b + (r ? 1 : 0);
}

// ====================== KEADAAN (STATE) ======================

/**
 * Keadaan awam TIDAK mengandungi no. telefon atau ID peranti.
 * Hanya isAdmin=true (selepas PIN disahkan di pelayan) menambah no. telefon.
 */
function buildState_(ss, dev, isAdmin) {
  var s = currentSession_(ss);
  var ps = sessionPlayers_(ss, s.id);
  var max = CONFIG.MAX_PLAYERS;
  var joined = false, guests = 0;

  var players = ps.map(function (p) {
    var mine = !!dev && p.device === dev;
    if (mine) { if (p.guestOf) guests++; else joined = true; }
    var o = {
      id: (mine || isAdmin) ? p.id : '',
      name: p.display, paid: p.paid, mine: mine, guest: !!p.guestOf
    };
    if (isAdmin) {
      o.raw = p.name;
      o.phone = p.phone;
      o.wa = p.phone ? (p.phone.charAt(0) === '0' ? '6' + p.phone : p.phone) : '';
      o.src = p.src;
    }
    return o;
  });

  var n = Math.min(ps.length, max);
  var court = cents_(s.court);
  var price = s.price === '' ? CONFIG.DEFAULT_SHUTTLE_PRICE * 100 : cents_(s.price);
  var shuttles = /^\d{1,2}$/.test(s.shuttles) ? Number(s.shuttles) : 0;
  var total = court + shuttles * price;

  var state = {
    ts: Date.now(),
    club: CONFIG.CLUB_NAME,
    url: CONFIG.APP_URL || ScriptApp.getService().getUrl() || '',
    max: max,
    maxGuests: CONFIG.MAX_GUESTS,
    session: {
      id: s.id, date: s.date, dateDisplay: displayDate_(s.date), hari: hari_(s.date),
      time: s.time, venue: s.venue, map: s.map, status: s.status
    },
    players: players,
    courts: courts_(n),
    me: { joined: joined, guests: guests },
    fee: {
      court: court, shuttles: shuttles, price: price, total: total, n: n,
      per: (total > 0 && n > 0) ? ceilDiv_(total, n * 100) : 0 // RM, dibundarkan ke atas
    },
    admin: null
  };

  if (isAdmin) {
    var drops = [];
    readRows_(ss.getSheetByName(SH.D), HEAD.TarikDiri.length).forEach(function (r) {
      if (r[0] === s.id) drops.push({ name: r[1], time: r[2], how: r[3], after: r[4] === 'YA' });
    });
    state.admin = {
      dropouts: drops,
      defaults: { date: nextDefaultDate_(), time: s.time, venue: s.venue, map: s.map }
    };
  }
  return state;
}
