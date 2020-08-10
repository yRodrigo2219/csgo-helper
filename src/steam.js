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
            let sessionid = generateSessionID();
            res.headers['set-cookie'].push(`sessionid=${sessionid}; `);

            let cookie = '';
            for (c of res.headers['set-cookie']) {
                console.log(c);

                let end = c.indexOf(';') + 2;
                cookie += c.substring(0, end);
            }

            config.headers.cookie = cookie;
            config.headers.sessionid = sessionid;

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
        let sessionid = generateSessionID();
        //config.headers.cookie = config.headers.cookie.replace(/sessionid=[0-9a-f]+/, `sessionid=${sessionid}`);
        //config.headers.sessionid = sessionid;

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
                'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/76.0.3809.100 Safari/537.36',
                sessionid: ''
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
    }).then(async (res) => {
        try {
            if (res.data.success) {
                let rginv = res.data.rgInventory;
                let rgdesc = res.data.rgDescriptions;

                let diskInv = JSON.parse(fs.readFileSync('./inventory.json'));
                let ids = [];
                let invSkins = {};
                let inv = [];

                for (const skin of diskInv) {
                    ids.push(skin.id);
                    invSkins[skin.id] = skin;
                }


                for (const id in rginv)
                    if (!ids.includes(id)) {
                        await pushItem(inv, rginv, rgdesc, id, steamID);
                    } else {
                        inv.push(invSkins[id]);
                    }

                fs.writeFileSync('./inventory.json', JSON.stringify(inv));

                console.log('Inventory updated!');

            } else {
                console.warn('\x1b[31m%s\x1b[0m', "Error retrieving player inventory!");
            }
        } catch (err) {
            if (res.data.success) {
                let rginv = res.data.rgInventory;
                let rgdesc = res.data.rgDescriptions;

                let inv = [];

                for (const id in rginv)
                    await pushItem(inv, rginv, rgdesc, id, steamID);

                fs.writeFileSync('./inventory.json', JSON.stringify(inv));

                console.log('Inventory updated!');
            } else {
                console.warn('\x1b[31m%s\x1b[0m', "Error retrieving player inventory!");
            }
        }
    });
}

exports.sellList = async function sellList() {
    let data = fs.readFileSync('./config.json');
    const config = JSON.parse(data);

    data = fs.readFileSync('./inventory.json');
    const inv = JSON.parse(data);

    const sellOrders = Object.keys(config['sell-orders']);
    let sessionid = config.headers.sessionid;
    let steamID = await getSteamID();

    for (const skin of inv)
        if (sellOrders.includes(skin.name))
            if (skin.float > config['sell-orders'][skin.name]['max-float']) {
                await sellItem(sessionid, skin.id, config['sell-orders'][skin.name].price, steamID);
                console.log(`Selling ${skin.name} ${skin.float}... (${skin.id})`)
            }

    console.log('All items were listed!');
    await this.getInventory();
}

function sellItem(sessionid, assetid, price, steamID) {
    let data = fs.readFileSync('./config.json');
    const config = JSON.parse(data);

    let params = {
        sessionid,
        appid: 730,
        contextid: 2,
        assetid,
        amount: 1,
        price
    };

    return axios.post(`https://steamcommunity.com/market/sellitem/`, qs.stringify(params), {
        headers: {
            'Cookie': config.headers.cookie,
            'User-Agent': config.headers['user-agent'],
            'Referer': `https://steamcommunity.com/profiles/${steamID}/inventory`
        }
    }).then(res => {
        if (res.data.success) {
            return res.data;
        } else {
            console.log('\x1b[31m%s\x1b[0m', `Error listing item! ${assetid}`);
        }
    });
}

async function pushItem(inv, rginv, rgdesc, id, steamID) {
    let desc = rginv[id].classid + '_' + rginv[id].instanceid;

    if (!rgdesc[desc].type.includes('Agent')
        && rgdesc[desc].commodity !== 1
        && rgdesc[desc].marketable !== 0) {

        let inspect = rgdesc[desc].actions[0].link.replace('%owner_steamid%', steamID);
        inspect = inspect.replace('%assetid%', id);

        let float;
        let flag = true;
        while (flag) {
            float = await getItemFloat(inspect);
            float != -1 ? flag = false : null;
        }

        console.log(rgdesc[desc].market_name + ' - ' + float);

        inv.push({
            name: rgdesc[desc].market_name,
            id,
            classid: rginv[id].classid,
            instanceid: rginv[id].instanceid,
            float,
            inspect
        });
    }
}

function getItemFloat(inspectLink) {
    return axios.get(`https://api.csgofloat.com/?url=${inspectLink}`).then((res) => {
        if (res.code) {
            console.log('\x1b[31m%s\x1b[0m', `Codigo de erro "${res.data.code}" na requisição da api!`);
            return -1;
        }
        return res.data.iteminfo.floatvalue;
    }).catch(() => {
        console.log('\x1b[31m%s\x1b[0m', "Erro na requisição da api!");
        return -1;
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