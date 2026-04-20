# Changelog

### Format: YY.FEATURE.PATCH
- YY = The year the feature was introduced
- FEATURE = The feature number from that year
    - When a new feature is released in a new year, FEATURE starts at 1
- PATCH = Bug fixes since the last feature added (Year doesn't turn over till new feature is added)

## v26.5.9 - Apr 19
Replaced/removed all instances of logWarning and logServerEvent 
(These weren't changed when I merged logging into one function, hense the recent issues)

## v26.5.8 - Apr 19
Added temporary console logs in bot.js for debugging

## v26.5.7 - Apr 19
Added timeout to all axios in announcements.js

## v26.5.6 - Apr 19
- Changed order of when channel verification steps happen
- Removed duplicate editReply step

## v26.5.5 - Apr 19
Moved the verified variable in bot.js for /announcement_add above any area that calls said variable

## v26.5.4 - Apr 19
Readded v26.5.3 log with a note

## v26.5.3 - Apr 19 - Skipped version due to rollback/cherry-pick (error arose after change)
Moved the verification log action till after verification in bot.js

## v26.5.2 - Apr 19
Commented out all Rumble code
Awaiting responce from Rumble support.

## v26.5.1 - Apr 4
Changed logging.js
- Merged logAction, logWarning, and logServerEvent into 1 function
    - All server logs go to server log channel
    - All warning and error logs go to my warning logs channel
    - All logs go to my full logs channel
- Added a lot more console usage
- Updated parameters
- Removed cooldown system for the all logs channel
- Changed code format and comments to be more my style

## v26.5.0 - Mar 28
Added logging system
- logging.js file created
- .env now includes 2 different logging channels within my discord server
    - normal log channel for all logs within all servers (this exists soley to see any recurring issues and monitoring)
    - warning log channel for any warnings or issues that are logged
- Logs when:
    - Bot joins new server
    - Announcements are added
    - Announcements are deleted
    - Announcements are modified
    - Verification attempts fail
    - YouTube API is close to out/is out and moving to RSS only
    - Server setup errors
    - NOTE: This will be expanded, but I wanted to add the feature at all before adjusting it
- Logging channel types:
    - ALL logs (private in my server)
    - Warning logs (private in my server)
    - Admin logs (created in all servers the bot is added to)
- Changed the announcements channel command to edit all auto created channels
    - includes option to move the announcements channel
    - includes option to move the logs channel
    - includes option to move both channels to the same spot

## v26.4.2 - Mar 27
- Edited v26.2.3 to include GitHub Repo being made public
- Edited v26.4.1 to say Mar 27 since it was past midnight when change wa made

## v26.4.1 - Mar 27 - NOTE: Versioning *was not changed* in GitHub until this update
Added CHANGELOG.md
- All logs from this log prior was added
- Created versioning system
- Updated version in package.json for the first time

## v26.4.1 - Mar 25
Fixed minor capitalization issue in bot.js

## v26.4.0 - Mar 25
Added YouTube API Quota Tracker Feature
- announcements.js
    - Added RSS feed backup for when API quota is reached/almost reached
    - Made API be the normal mode for posts, videos, and shorts
    - Unsure if streams and premiers still announce when RSS mdoe is on, but even if it does, API is close to being out so it'll stop shortly after
- bot.js
    - Added command that I can use to turn RSS mode on/off (doesn't override the automatic system)
- youtube-quota.js
    - NEW FILE ^
    - Added counter within bot to track quota
    - Added counter reset at midnight for auto RSS mode or the command 
    - Added warning to announcement channel when RSS mode is turned on automatically due to API quota reaching to close
- 

## v26.3.10 - Mar 25
Continued bug from past versions: ID input works, handle, username, and url doesn't work (only for YouTube)
- Changed YouTube channel search to look for non-ID inputs first

## v26.3.9 - Mar 25
Changed the YouTube channel search to use the API to get the channel ID from the input, then use the ID to get the channel information (announcements.js)

## v26.3.8 - Mar 25
Changed forHandle to forUsername in announcements.js for new change with youTube channel lookups

## v26.3.7 - Mar 25
Bot.js
- Fixed issue with data[guildId] not being initiallized/not existing (interaction failed in Discord when confirming to add new announcement in my server)
- Added postTime field
- Added lastCheckTime field

## v26.3.6 - Mar 25
Added contentType as input for the refresh command
- minor changes in announcements.js and bot.js for this feature

## v26.3.5 - Mar 25
Changed announcements feature to prevent blocking, reenable Rumble announcements, and adjust how Twitch information gets recieved
- Added cheerio for HTML parsing for Rumble in announcements.js
    - Many sections in announcements.js changed for this change
- Changed to trying Twitch API first, then go to RSS feed as a backup in announcements.js
- Removed the "coming soon" message for Rumble in bot.js
- Added cheerio to package.json

## v26.3.4 - Mar 25
Making the bot seem more trustworthy and professional - Prevent RSS blocking from Rumble
- Redefined bot network requests to seem more like a trstworthy discord bot than a sketchy website in announcements.js
- Added sleep function for Rumble notifications in announcements,js
- Added break from the last time Rumble's check failed in bot.js


## v26.3.3 - Mar 25
Added note of use of AI in README.md

## v26.3.2 - Mar 23
Removed /setcontenttypes command from bot.js
- Already exists in the edit command
- Weird to be separated

## v26.3.1 - Mar 23
All changed within bot.js, lots of different changes
- Changed command names to allow less confusion when adding new features (I.e: /add moved to /announcement_add)
- Extracted edit featured from /delete command (New command to edit)
- Added minor feature of an auto created channel in a newly joined server for announcements from me
- Added /setannouncementchannel command
- Added /setwelcomemessage command
    - Only admins in MY server can use this
    - Changes the welcome message the bot gives when joining a server
- Added announcement channel logic based on config.js addition
    - Added new embeds for announcements
- Changed Rumble to show as a "coming soon" feature due to issues with RSS and the known issue of no API

## v26.3.0 - Mar 23
Created config.js
- Feature: Allow me to announce updated and stuff to all channels who use the bot
- Server ID and Announcement Channel ID added within .env

## v26.2.7 - Mar 22
Added header to parser to hopefully bypass Rumble's RSS feed blockers

## v26.2.6 - Mar 22
Due to API quota being very small, the checkChannel() function in announcements.js was changed to mainly use RSS and be sparse with API
- Request for quota expansion was given to Google

## v26.2.5 - Mar 22
Did a test commit from my PC
- Prior commits with multiple files was using my laptop, but I hadn't setup the feature on my PC yet

##  v26.2.4 - Mar 22
Added bot invite link to README.md

## v26.2.3 - Mar 22
- Created README.md with basic info like contact information and discord server link
- Made GitHub Repository Public
- Changed bot token (Unsure of exact timing, but changed this at some point, and I think it was with this update)

## v26.2.2 - Mar 22
Debugging new announcements feature
- announcements.js
    - Added parseChannelInput function for the input of handles, usernames, channel IDs, and URLs
    - Modified multiple sections to adapt to the new function
    - Added a "search all" function to the refresh channel function
- bot.js
    - Adjusted multiple sections based on new announcements.js

## v26.2.1 - Mar 22
Fixed minor syntax issue in storage.js

## v26.2.0 - Mar 22
Added support for Twitch and Rumble notifications
- announcements.js
    - Axios still used
    - Added RSS parser for Rumble
    - Added list for platform color and emoji 
    - Added lists for what content is being looked for on each platform
    - Created logic to store Twitch's access token till it expires
    - Added strike through function for when a live stream ends
    - Added Twitch and Rumble to embed builder, channel verification, check channel, and refresh channel functions
    - Removed old processVideo function due to function limitations
    - Changed logic for deciding between posting a new, editing an existing, or skip posting an announcement to include the new types of content and platforms
- bot.js
    - Added code in areas for Twitch/Rumble compatibility given new announcements.js code
    - changed /____youtube to just be /____ (I.e: /addyoutube became /add)
    - Added /setmessage command
    - Added /setcontenttypes command
    - Added the menu to confirm or cancel adding a channel
- package.json 
    - added dotenv, axios, and rss-parser versions
    - removed express

## v26.1.3 - Mar 22
Renamed youtube.js to announcements.js

## v26.1.2 - Mar 22
Fixed comments, minor syntax errors, and grammar

## v26.1.1 - Mar 22
YouTube announcements feature and code readability (All work in bot.js)
- Added comments to existing code
- Added a command builder function
- Created /ping command 
- Created /addyoutube command
- Created /removeyoutube command
- Created /listyoutube command
- Created /refresh command
- Created /setrefreshpermission command
- Added logic to register slash commands, including console feedback
- Blocked non slash command chat input to the bot
- Added logic for checking and saving YouTube channels

## v26.1.0 - Mar 22
Created youtube.js (all version work within this file)
- Feature: YouTube announcements in Discord when a person creates content on YouTube that's being followed
- Converts JS date into a readable format
- Makes Requests to the YouTube API per channel
- Added embed builder function for the announcements
- Added edit history feature
- Created logic to follow for if no new video is announced, the same video from before is found, or if new information is found for a prior video
- Added 5 minute loop to check back in with all YT channels
- Added logic for the /refresh command

## v26.0.11 - Mar 21
Added data.json to .gitignore file

## v26.0.10 - Mar 21
Created storage.js
- Loads and saved data from/to data.json in project directory

## v26.0.9 - Mar 21
Created .gitignore file and added .env and node_modules/ to it

## v26.0.8 - Mar 21
Removed typo in bot.js

## v26.0.7 - Mar 21
Replaced all GatewayIntentBits with IntentsBitField within bot.js due to discord.js update 

## v26.0.6 - Mar 21
Replit to Pi transition
- Removed express server code from bot.js

## v26.0.5 - Mar 21
Replit use to local device (RaspberryPi) transition started
- created .env on Pi
- added .env requirement in bot.js

## v26.0.4 - Feb 15
Replit connection - package.json
- Added express to dependencies

## v26.0.3 - Feb 15
Replit connection & privacy - bot.js
- Added lightweight express server to keep bot alive while using Replit
- Added environment variable for my bot token within Replit and removed the token

## v26.0.2 - Feb 14
Fixed package.json (forgot commas)

## v26.0.1 - Feb 14
Added package.json file
- Basic file setup

## v26.0.0 - Feb 14
Initial bot.js file
- Basic bot setup
- !ping command for test
- Note: GitHub repository is private at this time