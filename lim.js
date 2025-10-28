const fs = require('fs');
const readline = require('readline');
const { ethers } = require('ethers');
const dotenv = require('dotenv');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

dotenv.config();

const colors = {
    reset: "\x1b[0m",
    cyan: "\x1b[36m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
    white: "\x1b[37m",
    bold: "\x1b[1m",
    magenta: "\x1b[35m", 
    blue: "\x1b[34m", 
    gray: "\x1b[90m", 
};

const logger = {
    info: (msg) => console.log(`${colors.cyan}[i] ${msg}${colors.reset}`),
    warn: (msg) => console.log(`${colors.yellow}[!] ${msg}${colors.reset}`),
    error: (msg) => console.log(`${colors.red}[x] ${msg}${colors.reset}`),
    success: (msg) => console.log(`${colors.green}[+] ${msg}${colors.reset}`),
    loading: (msg) => console.log(`${colors.magenta}[*] ${msg}${colors.reset}`),
    step: (msg) => console.log(`${colors.blue}[>] ${colors.bold}${msg}${colors.reset}`),
    critical: (msg) => console.log(`${colors.red}${colors.bold}[FATAL] ${msg}${colors.reset}`),
    summary: (msg) => console.log(`${colors.green}${colors.bold}[SUMMARY] ${msg}${colors.reset}`),
    banner: () => {
        const border = `${colors.blue}${colors.bold}╔═════════════════════════════════════════╗${colors.reset}`;
        const title = `${colors.blue}${colors.bold}║     🍉 19Seniman From Insider    🍉     ║${colors.reset}`; 
        const bottomBorder = `${colors.blue}${colors.bold}╚═════════════════════════════════════════╝${colors.reset}`;
        
        console.log(`\n${border}`);
        console.log(`${title}`);
        console.log(`${bottomBorder}\n`);
    },
    section: (msg) => {
        const line = '─'.repeat(40);
        console.log(`\n${colors.gray}${line}${colors.reset}`);
        if (msg) console.log(`${colors.white}${colors.bold} ${msg} ${colors.reset}`);
        console.log(`${colors.gray}${line}${colors.reset}\n`);
    },
    countdown: (msg) => process.stdout.write(`\r${colors.blue}[⏰] ${msg}${colors.reset}`),
};

const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
];

function randomUA() {
    return userAgents[Math.floor(Math.random() * userAgents.length)];
}

function parseProxy(proxyLine) {
    let proxy = proxyLine.trim();
    if (!proxy) return null;
    proxy = proxy.replace(/^https?:\/\//, '');
    const specialMatch = proxy.match(/^([^:]+):(\d+)@(.+):(.+)$/);
    if (specialMatch) {
        const [, host, port, user, pass] = specialMatch;
        return `http://${user}:${pass}@${host}:${port}`;
    }
    const parts = proxy.split(':');
    if (parts.length === 4 && !isNaN(parts[1])) {
        const [host, port, user, pass] = parts;
        return `http://${user}:${pass}@${host}:${port}`;
    }
    return `http://${proxy}`;
}

function readAndParseProxies(filePath) {
    if (!fs.existsSync(filePath)) return [];
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
    return lines.map(line => parseProxy(line)).filter(Boolean);
}

const CUSTOM_SIGN_TEXT = `blockstreet.money wants you to sign in with your Ethereum account:
0x4CBB1421DF1CF362DC618d887056802d8adB7BC0

Welcome to Block Street

URI: https://blockstreet.money
Version: 1
Chain ID: 1
Nonce: Z9YFj5VY80yTwN3n
Issued At: 2025-10-27T09:49:38.537Z
Expiration Time: 2025-10-27T09:51:38.537Z`;

const SAMPLE_HEADERS = {
    timestamp: process.env.EXAMPLE_TIMESTAMP || '',
    signatureHeader: process.env.EXAMPLE_SIGNATURE || ``,
    fingerprint: process.env.EXAMPLE_FINGERPRINT || '',
    abs: process.env.EXAMPLE_ABS || '',
    token: process.env.EXAMPLE_TOKEN || '',
    origin: 'https://blockstreet.money'
};

async function solveTurnstile(apikey, sitekey, pageurl) {
    logger.loading('Solving Cloudflare Turnstile captcha...');
    if (!apikey) throw new Error('2Captcha API key is missing from your .env file.');
    const submitUrl = 'http://2captcha.com/in.php';
    const submitData = new URLSearchParams({ key: apikey, method: 'turnstile', sitekey, pageurl, json: 1 });
    try {
        const submitRes = await axios.post(submitUrl, submitData);
        if (submitRes.data.status !== 1) throw new Error(`2Captcha submit failed: ${submitRes.data.request}`);
        const requestId = submitRes.data.request;
        const resUrl = `http://2captcha.com/res.php?key=${apikey}&action=get&id=${requestId}&json=1`;
        while (true) {
            await new Promise(resolve => setTimeout(resolve, 5000));
            const resRes = await axios.get(resUrl);
            if (resRes.data.status === 1) {
                logger.success('Captcha solved successfully!');
                return resRes.data.request;
            }
            if (resRes.data.request !== 'CAPCHA_NOT_READY') throw new Error(`2Captcha solve failed: ${resRes.data.request}`);
            logger.loading('Captcha not ready, waiting...');
        }
    } catch (error) {
        throw new Error(`Captcha solving process error: ${error.message}`);
    }
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (query) => new Promise(resolve => rl.question(query, resolve));
const closeRl = () => rl.close();

const getRandomAmount = (min, max) => Math.random() * (max - min) + min;
const randomDelay = async () => await sleep(getRandomAmount(5000, 10000));

// Fungsi countdown diperbarui untuk menggunakan logger.countdown
const countdown = async (seconds) => {
    let remaining = seconds;
    while (remaining > 0) {
        const h = Math.floor(remaining / 3600).toString().padStart(2, '0');
        const m = Math.floor((remaining % 3600) / 60).toString().padStart(2, '0');
        const s = Math.floor(remaining % 60).toString().padStart(2, '0');
        // Menggunakan logger.countdown yang baru
        logger.countdown(`Next run in: ${h}:${m}:${s} ...`);
        remaining--;
        await sleep(1000);
    }
    process.stdout.write('\r' + ' '.repeat(50) + '\r'); // Membersihkan baris countdown
    console.log(); // Pindah ke baris baru
};

class BlockStreetAPI {
    constructor(wallet, proxy = null) {
        this.wallet = wallet;
        this.sessionCookie = null;
        let agent = null;
        if (proxy) {
            try {
                agent = new HttpsProxyAgent(proxy);
            } catch (e) {
                logger.error(`Failed to create proxy agent for "${proxy}". Error: ${e.message}`);
            }
        }
        this.axios = axios.create({
            baseURL: 'https://api.blockstreet.money/api',
            httpsAgent: agent,
            headers: {
                "accept": "application/json, text/plain, */*",
                "accept-language": "en-US,en;q=0.9",
                "priority": "u=1, i",
                "sec-ch-ua": "\"Brave\";v=\"141\", \"Not?A_Brand\";v=\"8\", \"Chromium\";v=\"141\"",
                "sec-ch-ua-mobile": "?0",
                "sec-ch-ua-platform": "\"Windows\"",
                "sec-fetch-dest": "empty",
                "sec-fetch-mode": "cors",
                "sec-fetch-site": "same-site",
                "sec-gpc": "1",
                "Referer": "https://blockstreet.money/",
                "Origin": SAMPLE_HEADERS.origin
            },
            validateStatus: () => true
        });
    }

    async #sendRequest(config, requiresAuth = true) {
        config.headers = { ...(config.headers || {}), 'User-Agent': randomUA() };
        config.headers['fingerprint'] = SAMPLE_HEADERS.fingerprint;
        config.headers['timestamp'] = String(Date.now());
        config.headers['Cookie'] = requiresAuth ? (this.sessionCookie || '') : 'gfsessionid=';
        config.headers['origin'] = SAMPLE_HEADERS.origin;
        if (SAMPLE_HEADERS.token) config.headers['token'] = SAMPLE_HEADERS.token;

        try {
            const response = await this.axios.request(config);
            const setCookie = response.headers['set-cookie'];
            if (setCookie && Array.isArray(setCookie)) {
                const sessionCookie = setCookie.find(c => c.startsWith('gfsessionid='));
                if (sessionCookie) this.sessionCookie = sessionCookie.split(';')[0];
            }
            if (response.data && (response.data.code === 0 || response.data.code === '0')) {
                return response.data.data;
            }
            if (response.status >= 200 && response.status < 300) {
                return response.data;
            }
            throw new Error(JSON.stringify(response.data || response.statusText || response.status));
        } catch (error) {
            throw new Error(error.response?.data?.message || error.message || String(error));
        }
    }

    async login(captchaToken) {
        try {
            const useCustom = true;
            let nonce = null;
            let messageToSign = null;
            let issuedAt = new Date().toISOString();
            let expirationTime = new Date(Date.now() + 2 * 60 * 1000).toISOString(); 

            if (useCustom) {
                messageToSign = CUSTOM_SIGN_TEXT;
                const match = CUSTOM_SIGN_TEXT.match(/Nonce:\s*([^\n\r]+)/i);
                nonce = match ? match[1].trim() : (Math.random().toString(36).slice(2, 10));
                const issuedAtMatch = CUSTOM_SIGN_TEXT.match(/Issued At:\s*([^\n\r]+)/i);
                const expirationMatch = CUSTOM_SIGN_TEXT.match(/Expiration Time:\s*([^\n\r]+)/i);
                if (issuedAtMatch) issuedAt = issuedAtMatch[1].trim();
                if (expirationMatch) expirationTime = expirationMatch[1].trim();
            } else {
                const signnonce = await this.#sendRequest({ url: '/account/signnonce', method: 'GET' }, false);
                nonce = (signnonce && signnonce.signnonce) ? signnonce.signnonce : (Math.random().toString(36).slice(2, 10));
                messageToSign = `blockstreet.money wants you to sign in with your Ethereum account:\n${this.wallet.address}\n\nWelcome to Block Street\n\nURI: https://blockstreet.money\nVersion: 1\nChain ID: 1\nNonce: ${nonce}\nIssued At: ${issuedAt}\nExpiration Time: ${expirationTime}`;
            }

            logger.loading(`Signing message for ${this.wallet.address}...`);
            const signatureHex = await this.wallet.signMessage(messageToSign);
            const useStaticSig = process.env.USE_STATIC_SIGNATURE === '1';
            const headerSignatureValue = useStaticSig ? SAMPLE_HEADERS.signatureHeader : signatureHex;

            const form = new URLSearchParams();
            form.append('address', this.wallet.address);
            form.append('nonce', nonce);
            form.append('signature', signatureHex);
            form.append('chainId', '1');
            form.append('issuedAt', issuedAt);
            form.append('expirationTime', expirationTime);
            form.append('invite_code', process.env.INVITE_CODE || '');

            const config = {
                url: '/account/signverify',
                method: 'POST',
                headers: {
                    ...this.axios.defaults.headers,
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': randomUA(),
                    'timestamp': SAMPLE_HEADERS.timestamp,
                    'signature': headerSignatureValue,
                    'fingerprint': SAMPLE_HEADERS.fingerprint,
                    'abs': SAMPLE_HEADERS.abs,
                    'token': SAMPLE_HEADERS.token,
                    'origin': SAMPLE_HEADERS.origin,
                    'Cookie': this.sessionCookie || '',
                },
                data: form.toString(),
                httpsAgent: this.axios.defaults.httpsAgent,
            };

            logger.loading('Sending signverify request...');
            const response = await axios({
                baseURL: this.axios.defaults.baseURL,
                ...config,
                validateStatus: () => true
            });

            if (response.headers['set-cookie']) {
                const sessionCookie = response.headers['set-cookie'].find(c => c.startsWith('gfsessionid='));
                if (sessionCookie) { this.sessionCookie = sessionCookie.split(';')[0]; }
            }

            if (response.data && (response.data.code === 0 || response.status === 200)) {
                logger.success('Sign verify/login success.');
                
                return response.data.data || response.data;
            } else {
                
                const errMsg = response.data?.message || response.data?.msg || JSON.stringify(response.data) || `${response.status} ${response.statusText}`;
                throw new Error(`Sign verify failed: ${errMsg}`);
            }
        } catch (error) {
            throw new Error(`Login failed: ${error.message}`);
        }
    }

    getTokenList() { return this.#sendRequest({ url: '/swap/token_list', method: 'GET' }, false); }
    share() { return this.#sendRequest({ url: '/share', method: 'POST' }); }
    swap(f, t, fa, ta) { return this.#sendRequest({ url: '/swap', method: 'POST', data: { from_symbol: f, to_symbol: t, from_amount: String(fa), to_amount: String(ta) }, headers: { 'content-type': 'application/json' }}); }
    supply(s, a) { return this.#sendRequest({ url: '/supply', method: 'POST', data: { symbol: s, amount: String(a) }, headers: { 'content-type': 'application/json' }}); }
    withdraw(s, a) { return this.#sendRequest({ url: '/withdraw', method: 'POST', data: { symbol: s, amount: String(a) }, headers: { 'content-type': 'application/json' }}); }
    borrow(s, a) { return this.#sendRequest({ url: '/borrow', method: 'POST', data: { symbol: s, amount: String(a) }, headers: { 'content-type': 'application/json' }}); }
    repay(s, a) { return this.#sendRequest({ url: '/repay', method: 'POST', data: { symbol: s, amount: String(a) }, headers: { 'content-type': 'application/json' }}); }
    getEarnInfo() { return this.#sendRequest({ url: '/earn/info', method: 'GET' }); }
    getSupplies() { return this.#sendRequest({ url: '/my/supply', method: 'GET' }); }
}


const forEachWallet = async (wallets, proxies, numTransactions, taskFunction, captchaToken) => {
    let proxyIndex = 0;
    for (const wallet of wallets) {
        const proxy = proxies.length > 0 ? proxies[proxyIndex++ % proxies.length] : null;
        logger.info(`Processing wallet: ${wallet.address}`);
        const api = new BlockStreetAPI(wallet, proxy);
        try {
            await api.login(captchaToken);
            logger.success(`Wallet ${wallet.address} logged in successfully.`);
            for (let i = 0; i < numTransactions; i++) {
                logger.info(`--- Running transaction ${i + 1} of ${numTransactions} ---`);
                await taskFunction(api);
                await sleep(1000);
            }
        } catch (error) {
            logger.error(`Could not process task for wallet ${wallet.address}: ${error.message}`);
        }
        await sleep(3000);
    }
};

const processWalletsForDailyRun = async (wallets, proxies, tokenList, numTransactions, captchaToken) => {
    let proxyIndex = 0;
    for (const [index, wallet] of wallets.entries()) {
        const proxy = proxies.length > 0 ? proxies[proxyIndex++ % proxies.length] : null;
        // Menggunakan logger.step untuk header wallet
        logger.step(`Processing Wallet ${index + 1}/${wallets.length}: ${wallet.address}`);
        const api = new BlockStreetAPI(wallet, proxy);
        try {
            await api.login(captchaToken);
            logger.success(`Wallet ${wallet.address} logged in successfully.`);
        } catch (e) {
            logger.error(`Login failed for wallet ${wallet.address}: ${e.message}. Skipping.`);
            continue;
        }
        for (let i = 0; i < numTransactions; i++) {
            logger.info(`--- Starting Transaction Cycle ${i + 1} of ${numTransactions} ---`);
            let supplies = [];
            try { supplies = await api.getSupplies(); } 
            catch (e) { logger.error(`      Could not fetch supplies: ${e.message}`); }

            logger.loading("Executing 5 swaps...");
            const ownedTokens = (supplies || []).filter(a => a && parseFloat(a.amount) > 0);
            if (!ownedTokens || ownedTokens.length === 0) {
                logger.warn("No supplied assets found to swap from. Skipping swaps.");
            } else {
                for (let j = 0; j < 5; j++) {
                    try {
                        const fromTokenAsset = ownedTokens[Math.floor(Math.random() * ownedTokens.length)];
                        const fromToken = tokenList.find(t => t.symbol === fromTokenAsset.symbol);
                        if (!fromToken) continue;
                        let toToken;
                        do { toToken = tokenList[Math.floor(Math.random() * tokenList.length)]; } while (toToken.symbol === fromToken.symbol);
                        const fromAmount = getRandomAmount(0.001, 0.0015);
                        const toAmount = (fromAmount * parseFloat(fromToken.price)) / parseFloat(toToken.price || 1);
                        await api.swap(fromToken.symbol, toToken.symbol, fromAmount.toFixed(8), toAmount.toFixed(8));
                        logger.success(`Swap #${j+1}: ${fromAmount.toFixed(5)} ${fromToken.symbol} -> ${toAmount.toFixed(5)} ${toToken.symbol} successful.`);
                    } catch (e) {
                        logger.error(`Swap #${j+1} failed: ${e.message}`);
                    }
                    await randomDelay();
                }
            }
            const actions = [ { name: 'Supply', count: 2, func: api.supply.bind(api) }, { name: 'Withdraw', count: 2, func: api.withdraw.bind(api) }, { name: 'Borrow', count: 2, func: api.borrow.bind(api) }, { name: 'Repay', count: 1, func: api.repay.bind(api) } ];
            for (const action of actions) {
                logger.loading(` Executing ${action.count} ${action.name}(s)...`);
                for (let j = 0; j < action.count; j++) {
                    try {
                        const randomToken = tokenList[Math.floor(Math.random() * tokenList.length)];
            _           const amount = getRandomAmount(0.001, 0.0015);
                        await action.func(randomToken.symbol, amount.toFixed(8));
                        logger.success(`${action.name} #${j+1}: ${amount.toFixed(5)} ${randomToken.symbol} successful.`);
                    } catch (e) {
                        logger.error(`${action.name} #${j+1} failed: ${e.message}`);
                    }
                    await randomDelay();
                }
            }
        }
        logger.success(`All cycles completed for wallet ${wallet.address}.`);
        await sleep(5000);
    }
};

const runAllDaily = async (wallets, proxies, tokenList, captchaToken) => {
    logger.info("You chose: Run All Features Daily");
    const numTransactionsStr = await question("How many transaction cycles to run per wallet? ");
    const numTransactions = parseInt(numTransactionsStr, 10);
    if (isNaN(numTransactions) || numTransactions < 1) {
        logger.error("Invalid number. Returning to menu.");
        return;
    }
    logger.info(`Will run ${numTransactions} cycle(s) per wallet.`);
    while (true) {
        await processWalletsForDailyRun(wallets, proxies, tokenList, numTransactions, captchaToken);
        logger.success("Daily run completed for all wallets.");
        await countdown(24 * 60 * 60);
    }
};

const displayAndSelectToken = async (tokenList, promptMessage) => {
    console.log(colors.cyan + promptMessage + colors.reset);
    tokenList.forEach((token, index) => console.log(`${index + 1}. ${token.symbol}`));
    const choiceIndex = parseInt(await question('> '), 10) - 1;
    return (choiceIndex >= 0 && choiceIndex < tokenList.length) ? tokenList[choiceIndex] : null;
};

const main = async () => {
    logger.banner();
    const proxies = readAndParseProxies('proxies.txt');
    if (proxies.length > 0) logger.info(`${proxies.length} valid proxies loaded.`);
    const wallets = Object.keys(process.env).filter(key => key.startsWith('PRIVATE_KEY_') && process.env[key]).map(key => { try { return new ethers.Wallet(process.env[key]); } catch { logger.warn(`Could not load wallet from ${key}.`); return null; } }).filter(Boolean);
    if (wallets.length === 0) {
        // Menggunakan logger.critical untuk kesalahan fatal
        logger.critical('No valid private keys found in .env file. Exiting.');
        closeRl(); return;
    }
    logger.success(`Loaded ${wallets.length} wallet(s) from .env file.\n`);
    let sessionCaptchaToken;
    try {
        sessionCaptchaToken = await solveTurnstile(process.env.TWO_CAPTCHA_API_KEY, '0x4AAAAAABpfyUqunlqwRBYN', 'https://blockstreet.money/dashboard');
        if (!sessionCaptchaToken) throw new Error("Failed to solve the initial captcha.");
    } catch (error) {
        logger.critical(`Could not solve initial captcha: ${error.message}`);
        closeRl(); return;
    }
    let tokenList = [];
    try {
        const firstApi = new BlockStreetAPI(wallets[0], proxies.length > 0 ? proxies[0] : null);
        await firstApi.login(sessionCaptchaToken);
        logger.success("Initial login successful.");
        logger.loading("Checking-in (Daily Share)...");
        try { await firstApi.share(); logger.success("Daily share complete."); } catch (e) { logger.warn("Daily share failed or skipped: " + e.message); }

        logger.loading("Fetching balances...");
        const earnInfo = await firstApi.getEarnInfo();
        if (earnInfo && earnInfo.balance) {
            logger.info(`Earn Balance: ${parseFloat(earnInfo.balance).toFixed(4)}`);
        }
        const supplies = await firstApi.getSupplies();
        if (supplies && supplies.filter && supplies.filter(s => s.symbol).length > 0) {
            logger.info("Supplied Assets:");
            supplies.forEach(asset => {
                if (asset.symbol && parseFloat(asset.amount) > 0) {
                    console.log(`     - ${asset.symbol}: ${parseFloat(asset.amount).toFixed(4)}`);
                }
            });
        }
        
        console.log();
        logger.loading("Fetching available token list...");
        tokenList = await firstApi.getTokenList();
        logger.success("Token list fetched successfully.");
    } catch (error) {
        logger.critical(`Initial setup failed: ${error.message}`);
        closeRl(); return;
    }
    while (true) {
        // Menggunakan logger.section untuk menu
        logger.section('CHOOSE A FEATURE TO RUN');
        const choice = await question(`1. Swap Token\n2. Supply Token\n3. Withdraw Token\n4. Borrow Token\n5. Repay Token\n6. Run All Features Daily\n7. Exit\n> `);
        if (choice === '7') { logger.info("Exiting bot. Goodbye!"); closeRl(); return; }
        if (choice === '6') {
            await runAllDaily(wallets, proxies, tokenList, sessionCaptchaToken);
            continue;
        }
        let action, taskFunction;
        if (choice === '1') {
            action = 'Swap';
            const fromToken = await displayAndSelectToken(tokenList, "Select token to swap FROM:");
            if (!fromToken) { logger.error("Invalid 'from' token selection."); continue; }
            const toToken = await displayAndSelectToken(tokenList, "Select token to swap TO:");
            if (!toToken) { logger.error("Invalid 'to' token selection."); continue; }
            if (fromToken.symbol === toToken.symbol) { logger.error("Cannot swap to the same token."); continue; }
            const fromAmount = parseFloat(await question(`Amount of ${fromToken.symbol} to swap: `));
            taskFunction = async (api) => {
                try {
                    const toAmount = (fromAmount * parseFloat(fromToken.price)) / parseFloat(toToken.price || 1);
                    await api.swap(fromToken.symbol, toToken.symbol, fromAmount, toAmount.toFixed(8));
                    logger.success(`   Swap ${fromAmount} ${fromToken.symbol} -> ${toAmount.toFixed(5)} ${toToken.symbol} successful.`);
                } catch (e) { logger.error(`   Swap failed: ${e.message}`); }
            };
        } else {
            switch (choice) {
                case '2': action = 'Supply'; break;
                case '3': action = 'Withdraw'; break;
                case '4': action = 'Borrow'; break;
                case '5': action = 'Repay'; break;
                default: logger.error("Invalid choice."); continue;
            }
            const selectedToken = await displayAndSelectToken(tokenList, `Select a token to ${action}:`);
            if (!selectedToken) { logger.error("Invalid token selection."); continue; }
            const amount = await question(`Amount of ${selectedToken.symbol} to ${action}: `);
            taskFunction = async (api) => {
                try {
                    await api[action.toLowerCase()](selectedToken.symbol, amount);
                    logger.success(`   ${action} ${amount} ${selectedToken.symbol} successful.`);
                } catch (e) { logger.error(`   ${action} failed: ${e.message}`); }
            };
        }
        const numTransactionsStr = await question(`How many times to run per wallet? `);
        const numTransactions = parseInt(numTransactionsStr, 10);
        if (isNaN(numTransactions) || numTransactions < 1) { logger.error("Invalid number."); continue; }
        await forEachWallet(wallets, proxies, numTransactions, taskFunction, sessionCaptchaToken);
        logger.info(`${action} task has been run on all wallets. Returning to menu.`);
    }
};

main().catch(err => {
    logger.critical('A critical error occurred: ' + err.message);
    console.error(err); // Juga log stack trace untuk debug
    closeRl();
});
