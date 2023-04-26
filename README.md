# Uptime BOT

It is a Discord BOT developed to store the user's uptime on a server.

The BOT works by registering a report every time the user connects and disconnects of a voice channel. As the difference, in seconds, of time between these two reports is the activity time, the BOT can get and sum all these reports to know the user's uptime on the server.

## Usage

Setup a machine with NodeJS and a MongoDB cluster. Also, configure the BOT's access to your Discord server. So, run the BOT:

```sh
node index.js
```