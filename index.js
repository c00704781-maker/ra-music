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
  StreamType,
  entersState,
  VoiceConnectionStatus,
  getVoiceConnection
} = require("@discordjs/voice");

const ytdl = require("youtube-dl-exec");
const ffmpegPath = require("ffmpeg-static");
const { spawn } = require("child_process");

const TOKEN = process.env.DISCORD_TOKEN;
const BOT_NAME = process.env.BOT_NAME || "30";

if (!TOKEN) {
  console.error("Missing DISCORD_TOKEN");
  process.exit(1);
}

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
    queues.set(guildId, {
      tracks: [],
      player: createAudioPlayer({
        behaviors: {
          noSubscriber: NoSubscriberBehavior.Play
        }
      }),
      connection: null,
      currentFFmpeg: null,
      playing: false
    });
  }
  return queues.get(guildId);
}

async function getAudioInfo(query) {
  const search = query.startsWith("http") ? query : `ytsearch1:${query}`;

  const info = await ytdl(search, {
    dumpSingleJson: true,
    noPlaylist: true,
    noWarnings: true,
    format: "bestaudio/best",
    defaultSearch: "ytsearch1"
  });

  return {
    title: info.title || query,
    webpageUrl: info.webpage_url || info.original_url || query
  };
}

async function getDirectAudioUrl(url) {
  const direct = await ytdl(url, {
    getUrl: true,
    noPlaylist: true,
    noWarnings: true,
    format: "bestaudio/best"
  });

  return String(direct).split("\n")[0].trim();
}

async function playNext(guildId) {
  const q = getQueue(guildId);

  if (!q.connection || q.tracks.length === 0) {
    q.playing = false;
    return;
  }

  q.playing = true;
  const track = q.tracks.shift();

  try {
    const audioUrl = await getDirectAudioUrl(track.webpageUrl);

    if (q.currentFFmpeg) {
      q.currentFFmpeg.kill("SIGKILL");
    }

    const ffmpeg = spawn(ffmpegPath, [
      "-reconnect", "1",
      "-reconnect_streamed", "1",
      "-reconnect_delay_max", "5",
      "-i", audioUrl,
      "-analyzeduration", "0",
      "-loglevel", "0",
      "-f", "s16le",
      "-ar", "48000",
      "-ac", "2",
      "pipe:1"
    ]);

    q.currentFFmpeg = ffmpeg;

    const resource = createAudioResource(ffmpeg.stdout, {
      inputType: StreamType.Raw
    });

    q.connection.subscribe(q.player);
    q.player.play(resource);
  } catch (err) {
    console.error(err);
    playNext(guildId);
  }
}

client.once("ready", () => {
  console.log(`${client.user.tag} is online`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;

  const content = message.content.trim();
  const guildId = message.guild.id;
  const q = getQueue(guildId);

  const voiceChannel = message.member.voice.channel;

  // مثال: 30come
  if (content.toLowerCase() === `${BOT_NAME.toLowerCase()}come`) {
    if (!voiceChannel) {
      return message.reply("ادخل روم صوتي أول.");
    }

    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: message.guild.id,
      adapterCreator: message.guild.voiceAdapterCreator,
      selfDeaf: true
    });

    q.connection = connection;

    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
      return message.reply(`دخلت الروم: ${voiceChannel.name}`);
    } catch {
      connection.destroy();
      q.connection = null;
      return message.reply("ما قدرت أدخل الروم.");
    }
  }

  // شغل / ش
  if (content.startsWith("شغل ") || content.startsWith("ش ")) {
    if (!voiceChannel) {
      return message.reply("ادخل روم صوتي أول.");
    }

    const query = content.startsWith("شغل ")
      ? content.slice(4).trim()
      : content.slice(2).trim();

    if (!query) {
      return message.reply("اكتب اسم الأغنية بعد الأمر.");
    }

    if (!q.connection) {
      q.connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: message.guild.id,
        adapterCreator: message.guild.voiceAdapterCreator,
        selfDeaf: true
      });

      try {
        await entersState(q.connection, VoiceConnectionStatus.Ready, 20_000);
      } catch {
        q.connection.destroy();
        q.connection = null;
        return message.reply("ما قدرت أدخل الروم.");
      }
    }

    try {
      const track = await getAudioInfo(query);
      q.tracks.push(track);

      message.reply(`تمت الإضافة: ${track.title}`);

      if (!q.playing) {
        playNext(guildId);
      }
    } catch (err) {
      console.error(err);
      message.reply("فشل البحث أو التشغيل. جرّب رابط مباشر أو اسم ثاني.");
    }
  }

  // سكب / س
  if (content === "سكب" || content === "س") {
    if (q.currentFFmpeg) {
      q.currentFFmpeg.kill("SIGKILL");
      q.currentFFmpeg = null;
    }

    q.player.stop(true);
    message.reply("تم تخطي الأغنية.");

    playNext(guildId);
  }

  if (content === "وقف") {
    if (q.currentFFmpeg) q.currentFFmpeg.kill("SIGKILL");
    q.tracks = [];
    q.player.stop(true);

    const connection = getVoiceConnection(guildId);
    if (connection) connection.destroy();

    queues.delete(guildId);
    message.reply("تم إيقاف البوت وخروجه من الروم.");
  }
});

client.login(TOKEN);
