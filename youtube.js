const axios = require("axios"); // Lets us make HTTP requests to YouTube API
const { loadData, saveData } = require("./storage"); // Read/write storage functions
const { EmbedBuilder }       = require("discord.js"); // EmbedBuilder lets us create nicely formatted DC messages

const CHECK_INTERVAL = 300000; //time in milliseconds (300000 = 5min), how often to check for new post

// Convert JavaScript date object into a readable format
function formatTimestamp(date) {
  return date.toLocaleString("en-US", {
    month:        "long",    //full month name
    day:          "numeric", //day #
    year:         "numeric", //4-digit year
    hour:         "numeric", //hour #
    minute:       "2-digit", //2-digit minute #
    hour12:       true,      // used 12-hour format ------------- Change to customizable
    timeZoneName: "short"    //abreviated time zone name
  });
}

//Asks YT API for the most recent video from a specific channel
async function checkChannel(channelId) {
  try {
    //Make request to YT API 
    const response = await axios.get("https://www.googleapis.com/youtube/v3/search", {
      params: {
        key:       process.env.YOUTUBE_API_KEY, //key in .env file
        channelId: channelId, //channel ID is the ID, not @ or display name
        part:      "snippet", // contains basic info
        order:     "date",    //sort by newest
        maxResults: 1,        //choose most recent
        type:      "video"    //only videos, not playlists or channels
      }
    });

    // If no results from YT, return error
    if (! response.data.items || response.data.items.length === 0) return null;

    const video = response.data.items[0]; //grab most recent result

    //return only needed details
    return {
      videoId:     video.id.videoId,
      title:       video.snippet.title,
      channelName: video.snippet.thumbnails.high.url,
      url:         "https://www.youtube.com/watch?v=${video.id.videoId}",
      isLive:      video.snippet.liveBroadcastContent === "live" 
    };
  } catch (error) {
    // log the error if anything goes wrong, but don't crash the bot
    console.error("Error checking YouTube channel ${channelId}", error.message);
    return null;
  }
}

// Creates DC embed card for the announcement
// video = video details, custommessage = server custom announcement message
// editHistory = array of prior edits (empty of none)
function buildEmbed(video, custommessage, editHistory = []) {
  const embed = new EmbedBuilder()
    .setTitle(video.title)
    .setURL(video.url)
    .setImage(video.thumbnail)
    .setColor("FF0000") //YT's red color
    .addFields(
      { name: "Channel", value: video.channelname, inLine: true }, //show display name -------- add @ name as well
      { name: "Link",    value: video.url,         inLine: true }  //show clickable link
    )
    .setFooter({
      text: video.isLive ? "LIVE NOW!!!" : "New Video!"
    });

  //add edit history if message was edited
  if (editHistory.length > 0) {
    const historyText = editHistory
      .map(entry => "Last updates: ${entry.timestamp}") 
      .join("\n"); 
    embed.addFields({ name: "Edit History", value: historyText });
  }

  return embed;
}

// Main logic for new announcement, edit, or skip
// client = DC bot client, channelConfig = channel's saved settings
// guildData = all data for server, guildId = DC server ID
async function processVideo(client, channelConfig, guildData, guildId) {
  const latest = await checkChannel(channelConfig.youtubeChannelId); 
  if (!latest) return; // if YT returned nothing, stop --------------------------- add responce to admin log channel

  // Get objects for DC channel
  const discordChannel = client.channels.cache.get(channelConfig.discordChannelId);
  if (!discordChannel) return; // stop here if channel isn't found ---------------- add responce to admin log channel

  const customMessage = channelConfig.customMessage || "New content from ${latest.channelname}!";

  // OPTION 1 New video not yet announced
  if (channelConfig.lastVideoId !== latest.videoId) {
    const embed = buildEmbed(latest, customMessage); 
    const sent  = await discordChannel.send({
      content: customMessage,
      embeds: [embed]
    });

    // Save info so we can track video
    channelConfig.lastvideoId = latest.videoId;
    channelConfig.lastTitle   = lastest.title;
    channelConfig.lastthumbnail = latest.thumbnail;
    channelConfig.editHistory = [];
    channelConfig.checksAfterPost = 0;
    saveData(guildData); // save to data.json
    return;
  }

  // OPTION 2 Same Video and we can stop looking (stop after 10mins)
  if (channelConfig.checksAfterPost >== 2) return;
  channelConfig.checksAfterPost++; 

  // Check if any changes happened
  const = titleChanges = channelConfig.lastTitle !== latest.title;
  const thumbnailChanged = channelConfig.lastThumbnail !== latest.thumbnail;

  // No changes? save updated check counter and stop
  If (!titleChanged && !thumbnailChanged) {
    saveData(guildData);
    return;
  }

  // Something changed? edit the announcement
  try {
    const timestamp = formatTimestamp(new Date()); 

    // add edit to history
    if (!channelConfig.editHistory) channelConfig.editHistory = [];
    channelConfig.editHistory.push({ timestamp });

    //Remake the embed with updated info and edit time
    const embed = buildEmbed(latest, customMessage, channelConfig.editHistory);

    //Try to find and edit the original announcement
    if (channelConfig.lastMessageId) {
      try {
        // Fetch original message
        const originalMessage = await discordChannel.messages.fetch(
          channelConfig.lastMessageId
        );
        await originalMessage.edit({ content: customMessage, embeds: [embed] }); 
      } catch {
        // If no old message found, make a new one
        const sent = await discordChannel.send({
          content: customMessage,
          embeds:  [embed]
        });
        channelConfig.lastMessageId = send.id;
      }
    } else {
      // never saved message Id, so just send new message
      const sent = await discordChannel.send({
        content: custommessage,
        embeds:  [embed]
      });
      channelConfig.lastMessageid = sent.id;
    }

    // Update saved title and thumbnail
    channelConfig.lastTitle = latest.title;
    channelConfig.lastThumbnail = latest.thumbnail;
    saveData(guildData); //save changes to data.json

  } catch (error) {
    console.error("Error editing message: ", error.message):
  }
}

// Starts YT monitor (runs forever on 5min timer)
// client = DC bot client, passed from bot.js
async function startYouTubeMonitor(client) {
  console.log("Youtube monitor started");

  setInterval(async () => {
    const data = loadData(); '' load server config from data.json

    //loop through all servers with data saved ------------------------------- change to more efficient process 
    for (const guildId in data) {
      const guild = data[guildId];

      //skip server if YT notifications not setup
      if (!guild.youtube || !guild.youtube.channels) continue;

      //check all channels a server is monitoring
      for (const channelConfig of guil;d.youtube.channels) {
        await processVideo(client, channelConfig, data, guildId);
      }
    }
  }, CHECK_INTERVAL);
}

// Handles /refresh command
//interaction = the Discord slash command interaction object
async function refreshChannel(client, guildId, youtubeChallId, interaction) {
  const data = loadData();
  const guild = data[guildid];

  // double check server had YT channels setup
  if (!guild || !guild.youtube || !guild.youtube.channels) {
    await interaction.reply({
      content: "No YouTube channels are being monitored in this server at this time.",
      ephemeral: true //ephemeral means only the one who ran the command can see this
    })
  }

  // Find specific creator
  const channelConfig = guild.youtube.channels.find(
    c => c.youtubeChannelId == youtubeChannelId
  );

  // If creator cannot be found
  if  (!channelConfig) {
    await interaction.reply({
      content: "That creator is not being monitored in this server or cannot be found.",
      ephemeral: true
    })
    return;
  }

  // Check 10min cooldown
  const now = Date.now(); // time in milliseconds
  if (guild.youtube.lastrefresh && now - guild.youtube.lastRefresh < 600000) { 
    const remaining = Math.ceil(
      (600000 - (now - guild.youtube.lastRefresh)) / 60000
    );
    await interaction.reply({
      content: "Please wait ${remaining} more minute(s) before refreshing again",
      ephemeral: true
    });
    return;
  }

  //Update cooldown timestamp
  guild.youtube.lastRefresg = now;
  saveData(data);

  // Tell user were working on it
  await interaction.reply({
    content: "Checking for updates...",
    ephemeral: true
  });

  // Force a check of a channel
  await processVidoe(client, channelConfig, data, guildId);

  //Update reply when done
  await interaction.editReply({
    content: "Refresh Complete!",
    ephemeral: true
  });
}

// Export both functions so bot.js can use them
module.exports = { startYouTubeMonitor, refreshChannel };

  





















