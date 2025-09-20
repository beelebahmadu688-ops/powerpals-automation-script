// --- LANGKAH 1: INSTAL LIBRARY 'CHALK' ---
// Buka terminal atau Command Prompt di folder skrip ini dan jalankan:
// npm install chalk@4.1.2
// (Kita gunakan versi 4.x karena ini adalah versi terakhir yang kompatibel dengan 'require')

const fetch = require('node-fetch');
const chalk = require('chalk');

// --- PENTING: KONFIGURASI PENGGUNA ---
// Ganti nilai-nilai berikut dengan data Anda.
const userId = 242;
const BATTLE_CHECK_INTERVAL = 2000; // Cek status lebih cepat, setiap 2 detik
const API_INTERVAL = 5000;          // Jeda 5 detik antar aksi API

// --- KONFIGURASI API ---
const API_URL_LATEST_BATTLE = 'https://server.powerpals.xyz/api/royale/latestBattleLeaderboard';
const API_URL_BUY_TICKET = 'https://server.powerpals.xyz/api/royale/buyTicketHearts';
const API_URL_CLAIM_REWARD = 'https://server.powerpals.xyz/api/royale/claimReward';
const API_URL_TAP = 'https://server.powerpals.xyz/api/tap';

// --- FUNGSI HELPER ---

/**
 * Log pesan ke konsol dengan timestamp dan warna.
 * @param {string} message
 * @param {string} type - 'info', 'success', 'error', 'rank', 'balance'
 */
function log(message, type = 'info') {
    const timestamp = chalk.white(`[${new Date().toLocaleTimeString()}]`);
    let prefix = '';
    let coloredMessage = '';

    switch (type) {
        case 'success':
            prefix = chalk.green.bold('✅ SUCCESS:');
            coloredMessage = chalk.green(message);
            break;
        case 'error':
            prefix = chalk.red.bold('❌ ERROR:');
            coloredMessage = chalk.red(message);
            break;
        case 'rank':
            prefix = chalk.blue.bold('🏆 RANK:');
            coloredMessage = chalk.blue.bold(message);
            break;
        case 'balance':
            prefix = chalk.yellow.bold('💰 BALANCE:');
            coloredMessage = chalk.yellow(message);
            break;
        default:
            prefix = chalk.white('➡️ INFO:');
            coloredMessage = chalk.white(message);
            break;
    }
    console.log(`${timestamp} ${prefix} ${coloredMessage}`);
}

/**
 * Mengirim permintaan POST ke URL API.
 * @param {string} url
 * @param {object} payload
 * @returns {Promise<object|null>}
 */
async function fetchData(url, payload = {}) {
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            log(`Permintaan gagal: Status HTTP ${response.status} - ${errorText}`, 'error');
            return null;
        }
        return await response.json();
    } catch (error) {
        log(`Ada kesalahan saat mengirim permintaan: ${error.message}`, 'error');
        return null;
    }
}

async function fetchAndUpdateBalance() {
    log("Memperbarui saldo...");
    const payload = { user_id: userId, tap_count: 1 };
    const data = await fetchData(API_URL_TAP, payload);
    if (data && data.balance !== undefined) {
        log(`Saldo terbaru: ${data.balance} Hearts`, 'balance');
    } else {
        log("Gagal memperbarui saldo.", 'error');
    }
}

async function claimReward(battleId) {
    const payload = { battle_id: battleId, user_id: userId };
    const data = await fetchData(API_URL_CLAIM_REWARD, payload);
    if (data && data.success) {
        log(`Hadiah berhasil diklaim untuk Battle ID: ${battleId}.`, 'success');
        return true;
    } else {
        log('Gagal mengklaim hadiah: ' + (data.message || 'Tidak ada pesan.'), 'error');
        return false;
    }
}

async function buyTicket() {
    log("Mencoba membeli tiket baru...");
    const data = await fetchData(API_URL_BUY_TICKET, { user_id: userId });

    if (data && data.success) {
        log(`Tiket berhasil dibeli.`, 'success');
        await fetchAndUpdateBalance();
        return true;
    } else {
        log('Gagal membeli tiket: ' + (data.message || 'Tidak ada pesan.'), 'error');
        return false;
    }
}

async function waitForNewBattle(lastBattleId) {
    log("Menunggu pertempuran baru dimulai...");
    let newBattleId = lastBattleId;
    while (newBattleId === lastBattleId) {
        const statusData = await fetchData(API_URL_LATEST_BATTLE, { user_id: userId });
        if (!statusData) {
            log("Gagal mendapatkan status pertempuran, mencoba lagi...", 'error');
            await new Promise(resolve => setTimeout(resolve, API_INTERVAL));
            continue;
        }
        if (statusData.user_data) {
            newBattleId = statusData.user_data.battle_id;
        }
        if (newBattleId === lastBattleId) {
            await new Promise(resolve => setTimeout(resolve, BATTLE_CHECK_INTERVAL));
        }
    }
    log(`Pertempuran baru (ID: ${newBattleId}) telah dimulai!`, 'success');
}

// --- MAIN AUTOMATION LOOP ---

async function startAutomationCycle() {
    log("Memulai siklus otomatisasi baru...");

    try {
        const statusData = await fetchData(API_URL_LATEST_BATTLE, { user_id: userId });

        if (!statusData) {
            log("Gagal mendapatkan status dari server. Mencoba lagi.", 'error');
            setTimeout(startAutomationCycle, API_INTERVAL);
            return;
        }

        // KONDISI 1: ADA HADIAH UNTUK DIKLAIM
        if (statusData.status === true && statusData.user_data && statusData.user_data.is_claimed === false) {
            const { battle_id, rank, reward } = statusData.user_data;
            log(`Hasil Battle ID ${battle_id}: Anda meraih peringkat ke-${rank} dan mendapatkan ${reward} Hearts!`, 'rank');
            log("Hasil pertandingan tersedia! Mengklaim hadiah...");
            
            const rewardClaimed = await claimReward(battle_id);
            if (rewardClaimed) {
                await fetchAndUpdateBalance();
            }
            // Setelah klaim, tunggu untuk siklus berikutnya
            setTimeout(startAutomationCycle, API_INTERVAL);
            return;
        }
        
        // KONDISI 2: TIKET SUDAH DIBELI, MENUNGGU PERTANDINGAN SELESAI
        if (statusData.status === false && statusData.user_data && statusData.user_data.is_claimed === false) {
             const { battle_id } = statusData.user_data;
             log(`Pertandingan ID ${battle_id} sedang berlangsung. Menunggu hingga selesai...`, 'info');
             // Cukup tunggu dan ulangi siklus
             setTimeout(startAutomationCycle, API_INTERVAL);
             return;
        }

        // KONDISI 3: BELUM ADA TIKET ATAU HADIAH SUDAH DIKLAIM, SAATNYA BELI TIKET BARU
        log("Tidak ada hadiah yang bisa diklaim atau sudah diklaim. Mencoba membeli tiket baru...");
        const ticketBought = await buyTicket();
        if (ticketBought) {
            const lastBattleId = statusData.user_data ? statusData.user_data.battle_id : null;
            await waitForNewBattle(lastBattleId);
        }
        // Lanjutkan siklus untuk memeriksa status lagi
        setTimeout(startAutomationCycle, API_INTERVAL);
        
    } catch (err) {
        log(`Terjadi kesalahan tak terduga: ${err.message}`, 'error');
        setTimeout(startAutomationCycle, API_INTERVAL);
    }
}

// Mulai otomatisasi
startAutomationCycle();
