const inquirer = require('inquirer');
const steam = require('./src/steam');

async function main() {
    if (await steam.isLoggedIn()) {
        console.log('Already loggedin!');
        chooseAction();
        return;
    }

    inquirer.prompt([
        {
            type: 'input',
            name: 'user',
            message: 'Username:'
        },
        {
            type: 'password',
            name: 'pass',
            message: 'Password:'
        },
        {
            type: 'input',
            name: 'twof',
            message: 'TwoFactor:'
        }
    ]).then(async ({ user, pass, twof }) => {
        steam.login({
            username: user,
            password: pass,
            twoF: twof
        }).then(() => {
            chooseAction();
        });
    });
};


function chooseAction() {
    inquirer.prompt([{
        type: 'list',
        name: 'action',
        message: 'What do you want to do?',
        choices: ['Update Inventory', 'Show Inventory', 'Add Selling Item', 'Exec. Sell List']
    }]).then(async ({ action }) => {
        switch (action) {
            case 'Update Inventory':
                await steam.getInventory();
                break;
        }
    });
}

main();