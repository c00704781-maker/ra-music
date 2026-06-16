const {
  Client,
  GatewayIntentBits
} = require("discord.js");

const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  NoSubscriberBehavior,
  entersState,
  VoiceConnectionStatus,
  getVoiceConnection
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

    const player = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Pause
      }
    });

    const queue = {
      player,
      connection: null,
      songs: [],
      current: null,
      playing: false
    };

    player.on(AudioPlayerStatus.Idle, () => {
      playNext(guildId);
    });

    queues.set(guildId, queue);
  }

  return queues.get(guildId);
}

async function playNext(guildId) {

  const queue = getQueue(guildId);

  if (!queue.songs.length) {
    queue.playing = false;
    queue.current = null;
    return;
  }

  try {

    const song = queue.songs.shift();

    const stream = await play.stream(song.url);

    const resource = createAudioResource(
      stream.stream,
      {
        inputType: stream.type
      }
    );

    queue.current = song;
    queue.playing = true;

    queue.player.play(resource);
    queue.connection.subscribe(queue.player);

    console.log(`Now Playing: ${song.title}`);

  } catch (err) {

    console.error(err);

    playNext(guildId);
  }
}

client.once("ready", () => {
  console.log(`${client.user.tag} Online`);
});

client.on("messageCreate", async (message) => {

  if (message.author.bot || !message.guild) return;

  const content = message.content.trim();

  const guildId = message.guild.id;

  const queue = getQueue(guildId);

  const voiceChannel = message.member.voice.channel;

  // 30come

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
          guildId: message.guild.id,
          adapterCreator:
            message.guild.voiceAdapterCreator,
          selfDeaf: true
        });

      await entersState(
        connection,
        VoiceConnectionStatus.Ready,
        30000
      );

      queue.connection = connection;

      return message.reply(
        `✅ دخلت روم ${voiceChannel.name}`
      );

    } catch (err) {

      console.error(err);

      return message.reply(
        "❌ فشل دخول الروم."
      );
    }
  }

  // ش / شغل

  if (
    content.startsWith("ش ") ||
    content.startsWith("شغل ")
  ) {

    if (!voiceChannel) {
      return message.reply(
        "ادخل روم صوتي أول."
      );
    }

    let query;

    if (content.startsWith("شغل ")) {
      query = content.slice(4).trim();
    } else {
      query = content.slice(2).trim();
    }

    if (!query) {
      return message.reply(
        "اكتب اسم الأغنية."
      );
    }

    try {

      if (!queue.connection) {

        const connection =
          joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: message.guild.id,
            adapterCreator:
              message.guild.voiceAdapterCreator,
            selfDeaf: true
          });

        await entersState(
          connection,
          VoiceConnectionStatus.Ready,
          30000
        );

        queue.connection = connection;
      }

      const result =
        await play.search(query, {
          limit: 1
        });

      if (!result.length) {
        return message.reply(
          "لم يتم العثور على الأغنية."
        );
      }

      const song = {
        title: result[0].title,
        url: result[0].url
      };

      queue.songs.push(song);

      if (!queue.playing) {

        message.reply(
`🎵 Playing song :
${song.title}

by : ${message.author.username}`
        );

        playNext(guildId);

      } else {

        message.reply(
`➕ Add song :
${song.title}

by : ${message.author.username}`
        );
      }

    } catch (err) {

      console.error(err);

      message.reply(
        "❌ فشل تشغيل الأغنية."
      );
    }
  }

  // س / سكب

  if (
    content === "س" ||
    content === "سكب"
  ) {

    if (!queue.current) {
      return message.reply(
        "لا يوجد شيء شغال."
      );
    }

    const skipped =
      queue.current.title;

    queue.player.stop();

    return message.reply(
`⏭️ Skipped :
${skipped}

by : ${message.author.username}`
    );
  }

  // وقف

  if (content === "وقف") {

    queue.songs = [];
    queue.current = null;
    queue.playing = false;

    queue.player.stop();

    const connection =
      getVoiceConnection(guildId);

    if (connection) {
      connection.destroy();
    }

    queues.delete(guildId);

    return message.reply(
      "🛑 تم إيقاف البوت."
    );
  }
});

client.login(TOKEN);
