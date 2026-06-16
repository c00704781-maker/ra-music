const {
  Client,
  GatewayIntentBits
} = require("discord.js");

const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  entersState,
  VoiceConnectionStatus
} = require("@discordjs/voice");

const play = require("play-dl");

const TOKEN = process.env.DISCORD_TOKEN;
const BOT_NAME = process.env.BOT_NAME || "30";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent
  ]
});

const queues = new Map();

function getQueue(guildId) {
  if (!queues.has(guildId)) {

    const player = createAudioPlayer();

    queues.set(guildId, {
      player,
      connection: null,
      songs: [],
      current: null,
      playing: false
    });

    player.on(AudioPlayerStatus.Idle, () => {
      const q = queues.get(guildId);

      q.playing = false;

      if (q.songs.length > 0) {
        playSong(guildId);
      }
    });

    player.on("error", console.error);
  }

  return queues.get(guildId);
}

async function playSong(guildId) {

  const q = getQueue(guildId);

  if (!q.songs.length) {
    q.playing = false;
    q.current = null;
    return;
  }

  try {

    const song = q.songs.shift();

    const stream = await play.stream(song.url);

    const resource = createAudioResource(
      stream.stream,
      {
        inputType: stream.type
      }
    );

    q.current = song;
    q.playing = true;

    q.player.play(resource);

    q.connection.subscribe(q.player);

    console.log("Playing:", song.title);

  } catch (err) {
    console.error("PLAY ERROR:", err);
    q.playing = false;
  }
}

client.once("clientReady", () => {
  console.log(`${client.user.tag} Online`);
});

client.on("messageCreate", async (message) => {

  if (message.author.bot) return;
  if (!message.guild) return;

  console.log("MESSAGE:", message.content);

  const content = message.content.trim();

  const voiceChannel =
    message.member.voice.channel;

  const guildId =
    message.guild.id;

  const q =
    getQueue(guildId);

  if (content === "ping") {
    return message.reply("pong");
  }

  if (
    content.toLowerCase() ===
    `${BOT_NAME.toLowerCase()}come`
  ) {

    if (!voiceChannel) {
      return message.reply(
        "ادخل روم صوتي أول."
      );
    }

    try {

      const connection =
        joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: guildId,
          adapterCreator:
            message.guild.voiceAdapterCreator,
          selfDeaf: true
        });

      await entersState(
        connection,
        VoiceConnectionStatus.Ready,
        20000
      );

      q.connection = connection;

      return message.reply(
        `✅ دخلت ${voiceChannel.name}`
      );

    } catch (err) {

      console.error(err);

      return message.reply(
        "❌ فشل دخول الروم."
      );
    }
  }

  if (
    content.startsWith("ش ")
  ) {

    if (!voiceChannel) {
      return message.reply(
        "ادخل روم صوتي أول."
      );
    }

    const query =
      content.slice(2).trim();

    try {

      const results =
        await play.search(
          query,
          { limit: 1 }
        );

      if (!results.length) {
        return message.reply(
          "لم أجد الأغنية."
        );
      }

      const song = {
        title: results[0].title,
        url: results[0].url
      };

      q.songs.push(song);

      if (!q.playing) {

        message.reply(
          `🎵 Playing song:\n${song.title}`
        );

        playSong(guildId);

      } else {

        message.reply(
          `➕ Add song:\n${song.title}`
        );
      }

    } catch (err) {

      console.error(err);

      message.reply(
        "❌ فشل البحث."
      );
    }
  }

  if (content === "س") {

    if (!q.current) {
      return message.reply(
        "لا يوجد شيء يعمل."
      );
    }

    q.player.stop();

    return message.reply(
      `⏭️ Skipped:\n${q.current.title}`
    );
  }

});

client.login(TOKEN);
