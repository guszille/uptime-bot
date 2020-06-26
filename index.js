// Uptime Discord Bot module.
// Developed by: Gustavo Zille and Guilherme Souza.
//

// Nodejs libs and global declarations.
require('dotenv').config();
const Mongo = require('mongodb').MongoClient;
const Discord = require('discord.js');

const DISCORD_SECRET_TOKEN = process.env.DISCORD_SECRET_TOKEN;
const DATABASE_URL = process.env.DATABASE_URL;
const USERS_UPTIME_CACHE = {};
const USERS_ACTIVE = {};

let UPTIME_RANK_COUNTDOWN = 0;

// In milliseconds, persistence time of data on memory.
const CACHE_EXP_TIME = 6 * 60 * 60 * 1000;

// In milliseconds, countdown for requesting a new rank.
const COUNTDOWN_EXP_TIME = 12 * 60 * 60 * 1000;

// Emojis mapping of discord numbers.
const DISCORD_EMOJIS = [':zero:', ':one:', ':two:', ':three:', ':four:', ':five:', ':six:', ':seven:', ':eight:', ':nine:', ':keycap_ten:'];

// Use mongodb://localhost:27017/ to local database connection.
const client = Mongo(DATABASE_URL, { useNewUrlParser: true, useUnifiedTopology: true });

const bot = new Discord.Client();

const timestampToObject = timestamp => {
    return {
        days:    Math.floor(timestamp / 60 / 60 / 24),
        hours:   Math.floor(timestamp / 60 / 60 % 24),
        minutes: Math.floor(timestamp / 60 % 60),
        seconds: Math.floor(timestamp % 60)
    }
}

const getDatabaseConn = () => {
    return new Promise((resolve, reject) => {
        client.connect(err => {
            if (err) { reject(err); }

            else { resolve(client.db('discord')); }
        });
    });
}

const runDiscordBot = db => {
    bot.login(DISCORD_SECRET_TOKEN);

    bot.on('ready', () => {
        console.info(`Logged in as ${bot.user.tag}!`);
    });

    bot.on('message', async msg => {
        if (msg.content === '!sacrifice') {
            msg.reply('The seed of the gods is ready!');

        } else if (msg.content.startsWith('!uptime')) {
            const msgWords = msg.content.split(' ');

            if (msg.mentions.users.size) {
                const timestampNow = (new Date()).getTime();
                const taggedUser = msg.mentions.users.first();
                const userId = taggedUser.id;
                const find = { userid: userId };

                msg.channel.send(`Calculating uptime of: ${taggedUser.username}`);

                // TODO: Change database operation to aggregate.
                const get = () => {
                    return new Promise((resolve, reject) => {
                        db.collection('report').find(find).toArray((err, data) => {
                            if (err) { reject(err); }

                            else {
                                resolve(data);
                            }
                        });
                    });
                };

                try {
                    let total = 0;

                    if (userId in USERS_UPTIME_CACHE && USERS_UPTIME_CACHE[userId].exp > timestampNow) {
                        total = USERS_UPTIME_CACHE[userId].totalUptime;

                        USERS_UPTIME_CACHE[userId].exp = timestampNow + CACHE_EXP_TIME;

                    } else {
                        const docs = await get();

                        total = docs.reduce((total, { span }) => { return total + span }, 0) / 1000;

                        USERS_UPTIME_CACHE[userId] = {totalUptime: total, exp: timestampNow + CACHE_EXP_TIME};
                    }

                    const { days, hours, minutes, seconds } = timestampToObject(total);

                    msg.channel.send(`Spent time: ${days} days, ${hours} hours, ${minutes} minutes and ${seconds} seconds.`);

                } catch (e) {
                    msg.channel.send('Error on build user data, try again.');
                }
        
            } else if (msgWords.includes('rank')) {
                const timestampNow = (new Date()).getTime();

                if (UPTIME_RANK_COUNTDOWN < timestampNow) {
                    const pipe = [];

                    pipe.push({ $group: { _id: { user: '$userid' }, total: { $sum: '$span' } } });
                    pipe.push({ $sort: { total: -1 } });
                    pipe.push({ $limit: 10 });

                    const get = () => {
                        return new Promise((resolve, reject) => {
                            db.collection('report').aggregate(pipe).toArray((err, data) => {
                                if (err) { reject(err); }

                                else {
                                    resolve(data);
                                }
                            });
                        });
                    };

                    try {
                        const docs = await get();
                        const fields = [];

                        for (let i = 0; i < docs.length; i++) {
                            const user = bot.users.get(docs[i]['_id'].user);
                            const { days, hours, minutes, seconds } = timestampToObject(docs[i].total / 1000);

                            fields.push({
                                name: `${DISCORD_EMOJIS[i + 1]}\t${user.username}`,
                                value: `> ${days}d ${hours}h ${minutes}m ${seconds}s`,
                                inline: true
                            });
                        }

                        msg.channel.send({
                            embed: {
                                color: Math.floor(Math.random() * 0xffffff),
                                author: {
                                    name: bot.user.username,
                                    icon_url: bot.user.avatarURL
                                },
                                title: "TOP 10 i don't know the real world!",
                                description: '',
                                fields: fields,
                                timestamp: new Date(),
                                footer: {
                                    icon_url: bot.user.avatarURL,
                                    text: 'Hunter Association'
                                }
                            }
                        });

                        UPTIME_RANK_COUNTDOWN = timestampNow + COUNTDOWN_EXP_TIME;
                    
                    } catch (e) {
                        msg.channel.send('Error on build users rank, try again.');
                    }
                
                } else {
                    const next = timestampNow + (timestampNow - UPTIME_RANK_COUNTDOWN);

                    msg.channel.send(`You onky can request a new **rank** on __${new Date(next)}__.`);
                }
            
            } else if (msgWords.includes('help')) {
                const cmds = ['!uptime <UserTag>', '!uptime rank', '!uptime help', '!sacrifice'];
                
                msg.reply('You can use the commands:' + "\n```\n" + cmds.join('\n') + "\n```\n");
            }
        }
    });

    bot.on('voiceStateUpdate', async (oldUser, newUser) => {
        const newUserChannel = newUser.voiceChannel;
        const oldUserChannel = oldUser.voiceChannel;

        const timestamp = (new Date()).getTime();

        // User connects on voice channel.
        if (oldUserChannel === undefined && newUserChannel !== undefined) {
            const userId = newUser.user.discriminator;

            console.log('User connects on: ', timestamp);

            USERS_ACTIVE[userId] = {begin: timestamp};

        // User disconnects on voice channel.
        } else if (newUserChannel === undefined) {
            const userId = oldUser.user.discriminator;

            console.log('User disconnects on: ', timestamp);

            if (userId in USERS_ACTIVE) { // If statment for prevention.
                const span = timestamp - USERS_ACTIVE[userId].begin;
                const evt = {};

                evt.userid = userId;
                evt.begin = USERS_ACTIVE[userId].begin;
                evt.end = timestamp;
                evt.span = span;

                db.collection('report').insertOne(evt, (err, res) => {
                    if (err) {
                        console.error('Failed to insert on database: ', err);

                    } else {
                        // console.log('Insert response: ', res);
                        console.log('Succeful insertion on database.');
                    }
                });

                USERS_ACTIVE[userId] = {};

                if (userId in USERS_UPTIME_CACHE) {
                    USERS_UPTIME_CACHE[userId].totalUptime += span / 1000;
                    USERS_UPTIME_CACHE[userId].exp = timestamp + CACHE_EXP_TIME;
                }
            }
        }
    });
}

const main = async () => {
    const db = await getDatabaseConn();

    runDiscordBot(db);
}

main();