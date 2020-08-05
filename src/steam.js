const fs = require('fs');
const axios = require('axios');
const qs = require('qs');
const hex2b64 = require('node-bignumber').hex2b64;
const RSA = require('node-bignumber').Key;

var exports = module.exports = {};

exports.login = async function login({ username, password, twoF = null }) {
    let pKey = await getRSA(username);

    let data = fs.readFileSync('./config.json');
    const config = JSON.parse(data);

    let params = {
        donotcache: Date.now(),
        password: passwordEncrypt(password, pKey),
        username,
        twofactorcode: twoF,
        emailauth: null,
        loginfriendlyname: null,
        captchagid: -1,
        captcha_text: null,
        emailsteamid: null,
        rsatimestamp: pKey.timestamp,
        remember_login: true
    };

    return axios.post(`https://steamcommunity.com/login/dologin/`, qs.stringify(params), {
        headers: {
            'Cookie': config.headers.cookie,
            'User-Agent': config.headers['user-agent']
        },
        withCredentials: true
    }).then((res) => {
        if (res.data.success) {
            // saving cookies
            res.headers['set-cookie'].push(`sessionid=${generateSessionID()}; `);

            let cookie = '';
            for (c of res.headers['set-cookie']) {
                console.log(c);

                let end = c.indexOf(';') + 2;
                cookie += c.substring(0, end);
            }

            config.headers.cookie = cookie;

            fs.writeFileSync('./config.json', JSON.stringify(config));
            console.log('Success!');
        } else {
            console.warn('\x1b[31m%s\x1b[0m', 'Invalid credentials!');
        }
    }).catch((res) => {
        console.warn(res);
        console.warn('\x1b[31m%s\x1b[0m', "Login error!");
    });
}

exports.isLoggedIn = function isLoggedIn() {
    try {
        let data = fs.readFileSync('./config.json');
        const config = JSON.parse(data);

        // new sessionid every time you start
        //config.headers.cookie = config.headers.cookie.replace(/sessionid=[0-9a-f]+/, `sessionid=${generateSessionID()}`);

        return axios.get(`https://steamcommunity.com/chat/clientjstoken`, {
            headers: {
                'Cookie': config.headers.cookie,
                'User-Agent': config.headers['user-agent']
            }
        }).then((res) => {
            //fs.writeFileSync('./config.json', JSON.stringify(config));
            return res.data.logged_in;
        });
    } catch (err) { // initialize the config file if it doesnt exist
        const config = {
            headers: {
                cookie: '',
                'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/76.0.3809.100 Safari/537.36'
            },
            'sell-orders': {

            }
        };

        fs.writeFileSync('./config.json', JSON.stringify(config));
        isLoggedIn();
    }
}

exports.getInventory = async function getInventory() {
    let data = fs.readFileSync('./config.json');
    const config = JSON.parse(data);

    let steamID = await getSteamID();

    return axios.get(`https://steamcommunity.com/profiles/${steamID}/inventory/json/730/2`, {
        headers: {
            'Cookie': config.headers.cookie,
            'User-Agent': config.headers['user-agent']
        }
    }).then((res) => {
        if (res.data.success) {
            let rginv = res.data.rgInventory;
            let rgdesc = res.data.rgDescriptions;

            let inv = [];

            for (const id in rginv) {
                let desc = rginv[id].classid + '_' + rginv[id].instanceid;

                if (!rgdesc[desc].type.includes('Agent')
                    && rgdesc[desc].commodity !== 1
                    && rgdesc[desc].marketable !== 0) {

                    console.log(rgdesc[desc].market_name);
                    let inspect = rgdesc[desc].actions[0].link.replace('%owner_steamid%', steamID);
                    inspect = inspect.replace('%assetid%', id);
                    inv.push({
                        name: rgdesc[desc].market_name,
                        id,
                        classid: rginv[id].classid,
                        instanceid: rginv[id].instanceid,
                        float: -1,
                        inspect
                    });
                }
            }

            fs.writeFileSync('./inventory.json', JSON.stringify(inv));

            console.log('Inventory updated!');
        } else {
            console.warn('\x1b[31m%s\x1b[0m', "Error retrieving player inventory!");
        }
    });
}

function getSteamID() {
    let data = fs.readFileSync('./config.json');
    const config = JSON.parse(data);

    return axios.get(`https://steamcommunity.com/chat/clientjstoken`, {
        headers: {
            'Cookie': config.headers.cookie,
            'User-Agent': config.headers['user-agent']
        }
    }).then((res) => {
        return res.data.steamid;
    });
}

function getRSA(username) {
    return axios.post(`https://steamcommunity.com/login/getrsakey/`, qs.stringify({
        donotcache: Date.now(),
        username
    })).then((res) => {
        return res.data;
    }).catch(() => {
        console.warn('\x1b[31m%s\x1b[0m', "Error retrieving RSA key!");
    });
}

function passwordEncrypt(password, pKey) {
    let key = new RSA();
    key.setPublic(pKey.publickey_mod, pKey.publickey_exp);
    return hex2b64(key.encrypt(password));
}

function generateSessionID() {
    return require('crypto').randomBytes(12).toString('hex');
}