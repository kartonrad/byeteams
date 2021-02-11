#!/usr/bin/env node

const {exec, spawn} = require("child_process");
const chalk = require("chalk");
const readline = require('readline');
var config = require("./config.json");
const { writeFileSync } = require("fs");
const TeamsControl = require("./electron-inject");

console.log(chalk.blueBright(`
/-----------------\\
| BYE BYE TEAMS!! |
\\-----------------/`));

function printHelp() {
    console.log(
        chalk`
    {green ----------HELP----------}
    {bold ByeTeams®} will:
    1. Reopen Teams in {yellow Debug Mode} (may close already running Meetings)
    2. Then for every open Call 
        1. Open and watch the Call Participants
        {red -> Do NOT scroll on or close the Participant list!!!}
        2. ${config.handRatio<1 ?chalk`When {yellow.italic ${100*config.handRatio}%} of Users raise their hand (✋), also raise hand (✋)`: chalk`Will {italic.red NEVER} raise it's hand`}
        3. ${config.memberRatio>0 ?chalk`When only {yellow.italic ${100*config.memberRatio}%} of Users are left in the Meeting, {red.bold leave} the Meeting`: chalk`{grey ---}`}
        ${config.onOrganizerLeave ? chalk`4. When all {yellow.italic Organizers} leave, wait {yellow.italic 20s} and {red.bold leave} the Meeting` : ""}
    3. After leaving, send a Desktop Notification!
    4. Will repeat the same for every Call that starts (automatic redirects etc.)
    
    {blueBright Do you wish to change these Settings? (Y/N)}
    `);
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
async function changeSettingsPrompt() {
    var answer = await question(chalk`{blue Change?}>>`, rl);
    if(answer.includes("Y")) {
        var newConfig = config; 
        console.log(`Press ENTER to leave a value unchanged!!!!`);

        newConfig.handRatio = await askHandHandRaised();
        newConfig.memberRatio = await askMemberRatio();
        //newConfig.alarmLength = await askNumber(newConfig.alarmLength/10, `\nHow long (in secs) the alarm should play`);
        newConfig.onOrganizerLeave = await askBoolean(newConfig.onOrganizerLeave, `\nLeave when all Organizers have left? (Y/N)`);
        config = newConfig;
        writeFileSync("./config.json", JSON.stringify(config));
        printHelp()
        await changeSettingsPrompt();
    }
    else if(answer.includes("N")) {
        rl.close()
        return console.log(await attemptConnect());
    } else {
        await changeSettingsPrompt();
    }
}

printHelp()
changeSettingsPrompt();

// USER COMMUNICATION
function question(prompt, rl) {
    return new Promise((resolve, reject) => {
        rl.question(prompt, (answer) => {
            resolve(answer);
        })
    });
}

async function askBoolean(defaultVal, prompt) {
    console.log(prompt)
    var answer = await question(chalk`${defaultVal}>`, rl);
    if (answer === "" ) return defaultVal;
    if(answer.includes("Y")) {
        return true;
    }
    else if(answer.includes("N")) {
        return false;
    } else {
        await askBoolean(defaultVal, prompt);
    }
}

async function askNumber(defaultVal, prompt) {
    console.log(prompt);
    var answer = await question(`${defaultVal}> `, rl);
    if (answer === "" ) return defaultVal;
    var number = parseFloat( answer );
    if(Number.isNaN(number)) {
        console.log(chalk`{red uhhh let's try that again haha
{italic.bold DONT MISSPEL IT THIS TIME}}`)
        return askNumber(defaultVal, prompt);
    }

    return number;
}

async function askHandHandRaised() {
    var handRatio = await askNumber(config.handRatio, 
`
Ratio of Users raising their Hand, before the bot raises it's hand
(in decimal, '1' to never raise hand)`);

    if(handRatio>=1) console.log(chalk`{blueBright Bot will {red.italic NEVER} raise it's hand}`);
    else console.log(chalk`{blueBright Bot will raise it's hand when {yellow.italic ${handRatio*100}%} of Users have raised their hands}`)

    if(handRatio <= 0.34) { 
        console.log(chalk`{red.bold The Bot will raise it's hand very very easily
and is very likely to be picked by a teacher?
Continue? (Y/N)}`)
        var confirmation = await question(`CONFIRM> `, rl)
        if(!confirmation.includes("Y")) return askHandHandRaised()
    }

    return handRatio;
}

async function askMemberRatio() {
    var memberRatio = await askNumber(config.memberRatio, 
`
Ratio of Users that are left in the meeting, before Bot leaves
(in decimal, '0' to never leaver)`);

    if(memberRatio<=0) console.log(chalk`{blueBright Bot will {red.italic NEVER} leave as a result of others leaving}`);
    else console.log(chalk`{blueBright Bot will leave when only {yellow.italic ${memberRatio*100}%} of Users are left in the Meeting}`)

    if(memberRatio >= 0.6){ 
        console.log(chalk`{red.bold The Bot will leave the Meeting very easily
and is very likely to cause suspicion.
Continue? (Y/N)}`)
        var confirmation = await question(`CONFIRM> `, rl)
        if(!confirmation.includes("Y")) return askMemberRatio()
    }

    return memberRatio;
}

//MAIN
async function attemptConnect(openedDebugTeams=false) {
    var failure = true;
    try {
        var res = await TeamsControl.getWindows(36193);
        for (let entr in res) {
            let window = res[entr];
            if(window.url.includes("https://teams.microsoft.com") ) {
                failure = false; break;
            }
        }
    } catch (err) {
        faliure = true;
    }

    if(!failure) {
        console.log("Found Teams Instance in debug Mode. Proceeding...");
        console.log(chalk`{red ---------RUNNING--------}\n\n`);
        return TeamsControl.main(36193);
    }

    if(failure && !openedDebugTeams) {
        await openDebugTeams();
        console.log("Waiting for Teams to open (5s)")
        await sleep(5000)
        return await attemptConnect(true);
    }

    if(failure && openedDebugTeams) {
        console.log("Could not open Teams in Debug Mode. Please open Teams, so we can grab the Path")
    }
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

// PROCESS CONTROL
async function getRunningTeamsPath() {
    return new Promise((resolve, reject) => {
        var path;
    
        if(process.platform !== "win32") {
            var command = `ps e -C Teams`;
            exec(command, (err, stdout, stderr) => {
                path = stdout.match(/_=(\S*)/g)[0];
                path = path.substr(2);

                if(err) reject(err);
                resolve(path);
            });
        } else {
            var command = `wmic process where "name='teams.exe'" get ExecutablePath`;
            exec(command, (err, stdout, stderr) => {
                path = stdout.split("\n")[1]

                if(err) reject(err);
                resolve(path);
            });
        };
    
    });
}

async function openDebugTeams(force=false) {
    var path, runningPath;
    if(force) {
        path= force;
    }else{
        var runningPath = await getRunningTeamsPath();
        path = config.teams_path || runningPath;

        await killTeams()
    }   
    
    console.log(chalk`Opening Teams... {grey Path: ${path}}`)

    exec(path+" --remote-debugging-port=36193", (err, stdout, stderr) => {
        //if(err) console.error(err);
        if (err && force) {
            console.log(chalk`Couldn't find Microsoft Teams. Please open Teams and try again.
Or go to ${__dirname}/config.json and fill in the Path to the Executable, {italic if you know what you're doing}`);
            process.exit(1)
        }

        if(err&&!force) {
            openDebugTeams(runningPath);
        }
    });
    
    if(force ||!config.teams_path) {
        config.teams_path = path.replace("\r", ""); 
        writeFileSync("./config.json", JSON.stringify(config));
    }
}

function killTeams() {
    return new Promise((resolve) => {
        var cmd;
        if(process.platform === "win32") cmd = 'taskkill /t /IM teams.exe /f';
        else if (process.platform === "darwin") cmd = 'killall Teams; killall teams;'
        else cmd = 'killall Teams; killall teams;';

        exec(
            cmd
        , (err, stdout, stderr) => {
            stdout.split("\n").forEach((msg) =>{ if(msg) console.log(chalk`{grey [OS:LOGS] ${msg}}`)});
            stderr.split("\n").forEach((msg) =>{ if(msg) console.log(chalk`{red [OS:ERRORS] ${msg}}`)});
            resolve();
        })
    })  
}

/* 

  PID TTY      STAT   TIME COMMAND
    8 pts/0    Ss     0:00 -bash HOSTTYPE=x86_64 LANG=C.UTF-8 PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/games:/usr/local/games:/mnt/c/Program Files/WindowsApps/CanonicalGroupLimited.Ubuntu20.04onWindows_2004.2020.812.0_x64__79rhkp1fndgsc:/mnt/c/program files/graphicsmagick-1.3.33-q16:/mnt/c/Program Files (x86)/Common Files/Oracle/Java/javapath:/mnt/c/Program Files (x86)/Intel/Intel(R) Management Engine Components/iCLS/:/mnt/c/Program Files/Intel/Intel(R) Management Engine Components/iCLS/:/mnt/c/Windows/system32:/mnt/c/Windows:/mnt/c/Windows/System32/Wbem:/mnt/c/Windows/System32/WindowsPowerShell/v1.0/:/mnt/c/Windows/System32/OpenSSH/:/mnt/c/Program Files (x86)/Intel/Intel(R) Management Engine Components/DAL:/mnt/c/Program Files/Intel/Intel(R) Management Engine Components/DAL:/mnt/c/Program Files (x86)/NVIDIA Corporation/PhysX/Common:/mnt/c/WINDOWS/system32:/mnt/c/WINDOWS:/mnt/c/WINDOWS/System32/Wbem:/mnt/c/WINDOWS/System32/WindowsPowerShell/v1.0/:/mnt/c/WINDOWS/System32/OpenSSH/:/mnt/c/Program Files/Intel/WiFi/bin/:/mnt/c/Program Files/Common Files/Intel/WirelessCommon/:/mnt/c/Program Files/nodejs/:/mnt/c/Program Files/dotnet/:/mnt/c/Program Files/PuTTY/:/mnt/c/Program Files/Git/cmd:/mnt/c/Users/kongr/.cargo/bin:/mnt/c/Users/kongr/AppData/Local/Programs/Python/Python37/Scripts/:/mnt/c/Users/kongr/AppData/Local/Programs/Python/Python37/:/mnt/c/Program Files/MySQL/MySQL Shell 8.0/bin/:/mnt/c/Users/kongr/node_modules/.bin:/mnt/c/Users/kongr/AppData/Local/Microsoft/WindowsApps:/mnt/c/Users/kongr/AppData/Local/Programs/Microsoft VS Code/bin:/mnt/c/FFmpeg/bin:/mnt/c/Users/kongr/AppData/Roaming/npm:/mnt/c/Users/kongr/AppData/Local/Programs/Python/Python38-32:/mnt/c/Users/kongr/AppData/Local/Programs/Python/Python38-32/Scripts:/mnt/c/Program Files/heroku/bin:/mnt/c/flutter/bin:/mnt/c/console TERM=xterm-256color WSLENV= WSL_INTEROP=/run/WSL/7_interop NAME=DRKSLV HOME=/home/drkslv USER=drkslv LOGNAME=drkslv SHELL=/bin/bash WSL_DISTRO_NAME=Ubuntu-20.04
  102 pts/0    Sl+    0:00 node SHELL=/bin/bash WSL_DISTRO_NAME=Ubuntu-20.04 NAME=DRKSLV PWD=/home/drkslv LOGNAME=drkslv MOTD_SHOWN=update-motd HOME=/home/drkslv LANG=C.UTF-8 WSL_INTEROP=/run/WSL/7_interop LS_COLORS=rs=0:di=01;34:ln=01;36:mh=00:pi=40;33:so=01;35:do=01;35:bd=40;33;01:cd=40;33;01:or=40;31;01:mi=00:su=37;41:sg=30;43:ca=30;41:tw=30;42:ow=34;42:st=37;44:ex=01;32:*.tar=01;31:*.tgz=01;31:*.arc=01;31:*.arj=01;31:*.taz=01;31:*.lha=01;31:*.lz4=01;31:*.lzh=01;31:*.lzma=01;31:*.tlz=01;31:*.txz=01;31:*.tzo=01;31:*.t7z=01;31:*.zip=01;31:*.z=01;31:*.dz=01;31:*.gz=01;31:*.lrz=01;31:*.lz=01;31:*.lzo=01;31:*.xz=01;31:*.zst=01;31:*.tzst=01;31:*.bz2=01;31:*.bz=01;31:*.tbz=01;31:*.tbz2=01;31:*.tz=01;31:*.deb=01;31:*.rpm=01;31:*.jar=01;31:*.war=01;31:*.ear=01;31:*.sar=01;31:*.rar=01;31:*.alz=01;31:*.ace=01;31:*.zoo=01;31:*.cpio=01;31:*.7z=01;31:*.rz=01;31:*.cab=01;31:*.wim=01;31:*.swm=01;31:*.dwm=01;31:*.esd=01;31:*.jpg=01;35:*.jpeg=01;35:*.mjpg=01;35:*.mjpeg=01;35:*.gif=01;35:*.bmp=01;35:*.pbm=01;35:*.pgm=01;35:*.ppm=01;35:*.tga=01;35:*.xbm=01;35:*.xpm=01;35:*.tif=01;35:*.tiff=01;35:*.png=01;35:*.svg=01;35:*.svgz=01;35:*.mng=01;35:*.pcx=01;35:*.mov=01;35:*.mpg=01;35:*.mpeg=01;35:*.m2v=01;35:*.mkv=01;35:*.webm=01;35:*.ogm=01;35:*.mp4=01;35:*.m4v=01;35:*.mp4v=01;35:*.vob=01;35:*.qt=01;35:*.nuv=01;35:*.wmv=01;35:*.asf=01;35:*.rm=01;35:*.rmvb=01;35:*.flc=01;35:*.avi=01;35:*.fli=01;35:*.flv=01;35:*.gl=01;35:*.dl=01;35:*.xcf=01;35:*.xwd=01;35:*.yuv=01;35:*.cgm=01;35:*.emf=01;35:*.ogv=01;35:*.ogx=01;35:*.aac=00;36:*.au=00;36:*.flac=00;36:*.m4a=00;36:*.mid=00;36:*.midi=00;36:*.mka=00;36:*.mp3=00;36:*.mpc=00;36:*.ogg=00;36:*.ra=00;36:*.wav=00;36:*.oga=00;36:*.opus=00;36:*.spx=00;36:*.xspf=00;36: LESSCLOSE=/usr/bin/lesspipe %s %s TERM=xterm-256color LESSOPEN=| /usr/bin/lesspipe %s USER=drkslv SHLVL=1 WSLENV= XDG_DATA_DIRS=/usr/local/share:/usr/share:/var/lib/snapd/desktop PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/games:/usr/local/games:/mnt/c/Program Files/WindowsApps/CanonicalGroupLimited.Ubuntu20.04onWindows_2004.2020.812.0_x64__79rhkp1fndgsc:/mnt/c/program files/graphicsmagick-1.3.33-q16:/mnt/c/Program Files (x86)/Common Files/Oracle/Java/javapath:/mnt/c/Program Files (x86)/Intel/Intel(R) Management Engine Components/iCLS/:/mnt/c/Program Files/Intel/Intel(R) Management Engine Components/iCLS/:/mnt/c/Windows/system32:/mnt/c/Windows:/mnt/c/Windows/System32/Wbem:/mnt/c/Windows/System32/WindowsPowerShell/v1.0/:/mnt/c/Windows/System32/OpenSSH/:/mnt/c/Program Files (x86)/Intel/Intel(R) Management Engine Components/DAL:/mnt/c/Program Files/Intel/Intel(R) Management Engine Components/DAL:/mnt/c/Program Files (x86)/NVIDIA Corporation/PhysX/Common:/mnt/c/WINDOWS/system32:/mnt/c/WINDOWS:/mnt/c/WINDOWS/System32/Wbem:/mnt/c/WINDOWS/System32/WindowsPowerShell/v1.0/:/mnt/c/WINDOWS/System32/OpenSSH/:/mnt/c/Program Files/Intel/WiFi/bin/:/mnt/c/Program Files/Common Files/Intel/WirelessCommon/:/mnt/c/Program Files/nodejs/:/mnt/c/Program Files/dotnet/:/mnt/c/Program Files/PuTTY/:/mnt/c/Program Files/Git/cmd:/mnt/c/Users/kongr/.cargo/bin:/mnt/c/Users/kongr/AppData/Local/Programs/Python/Python37/Scripts/:/mnt/c/Users/kongr/AppData/Local/Programs/Python/Python37/:/mnt/c/Program Files/MySQL/MySQL Shell 8.0/bin/:/mnt/c/Users/kongr/node_modules/.bin:/mnt/c/Users/kongr/AppData/Local/Microsoft/WindowsApps:/mnt/c/Users/kongr/AppData/Local/Programs/Microsoft VS Code/bin:/mnt/c/FFmpeg/bin:/mnt/c/Users/kongr/AppData/Roaming/npm:/mnt/c/Users/kongr/AppData/Local/Programs/Python/Python38-32:/mnt/c/Users/kongr/AppData/Local/Programs/Python/Python38-32/Scripts:/mnt/c/Program Files/heroku/bin:/mnt/c/flutter/bin:/mnt/c/console:/snap/bin HOSTTYPE=x86_64 _=/usr/bin/node
  115 pts/1    Ss     0:00 -bash HOSTTYPE=x86_64 LANG=C.UTF-8 PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/games:/usr/local/games:/mnt/c/Program Files/WindowsApps/CanonicalGroupLimited.Ubuntu20.04onWindows_2004.2020.812.0_x64__79rhkp1fndgsc:/mnt/c/program files/graphicsmagick-1.3.33-q16:/mnt/c/Program Files (x86)/Common Files/Oracle/Java/javapath:/mnt/c/Program Files (x86)/Intel/Intel(R) Management Engine Components/iCLS/:/mnt/c/Program Files/Intel/Intel(R) Management Engine Components/iCLS/:/mnt/c/Windows/system32:/mnt/c/Windows:/mnt/c/Windows/System32/Wbem:/mnt/c/Windows/System32/WindowsPowerShell/v1.0/:/mnt/c/Windows/System32/OpenSSH/:/mnt/c/Program Files (x86)/Intel/Intel(R) Management Engine Components/DAL:/mnt/c/Program Files/Intel/Intel(R) Management Engine Components/DAL:/mnt/c/Program Files (x86)/NVIDIA Corporation/PhysX/Common:/mnt/c/WINDOWS/system32:/mnt/c/WINDOWS:/mnt/c/WINDOWS/System32/Wbem:/mnt/c/WINDOWS/System32/WindowsPowerShell/v1.0/:/mnt/c/WINDOWS/System32/OpenSSH/:/mnt/c/Program Files/Intel/WiFi/bin/:/mnt/c/Program Files/Common Files/Intel/WirelessCommon/:/mnt/c/Program Files/nodejs/:/mnt/c/Program Files/dotnet/:/mnt/c/Program Files/PuTTY/:/mnt/c/Program Files/Git/cmd:/mnt/c/Users/kongr/.cargo/bin:/mnt/c/Users/kongr/AppData/Local/Programs/Python/Python37/Scripts/:/mnt/c/Users/kongr/AppData/Local/Programs/Python/Python37/:/mnt/c/Program Files/MySQL/MySQL Shell 8.0/bin/:/mnt/c/Users/kongr/node_modules/.bin:/mnt/c/Users/kongr/AppData/Local/Microsoft/WindowsApps:/mnt/c/Users/kongr/AppData/Local/Programs/Microsoft VS Code/bin:/mnt/c/FFmpeg/bin:/mnt/c/Users/kongr/AppData/Roaming/npm:/mnt/c/Users/kongr/AppData/Local/Programs/Python/Python38-32:/mnt/c/Users/kongr/AppData/Local/Programs/Python/Python38-32/Scripts:/mnt/c/Program Files/heroku/bin:/mnt/c/flutter/bin:/mnt/c/console TERM=xterm-256color WSLENV= WSL_INTEROP=/run/WSL/114_interop NAME=DRKSLV HOME=/home/drkslv USER=drkslv LOGNAME=drkslv SHELL=/bin/bash WSL_DISTRO_NAME=Ubuntu-20.04
  133 pts/1    R+     0:00 ps e SHELL=/bin/bash WSL_DISTRO_NAME=Ubuntu-20.04 NAME=DRKSLV PWD=/home/drkslv LOGNAME=drkslv HOME=/home/drkslv LANG=C.UTF-8 WSL_INTEROP=/run/WSL/114_interop LS_COLORS=rs=0:di=01;34:ln=01;36:mh=00:pi=40;33:so=01;35:do=01;35:bd=40;33;01:cd=40;33;01:or=40;31;01:mi=00:su=37;41:sg=30;43:ca=30;41:tw=30;42:ow=34;42:st=37;44:ex=01;32:*.tar=01;31:*.tgz=01;31:*.arc=01;31:*.arj=01;31:*.taz=01;31:*.lha=01;31:*.lz4=01;31:*.lzh=01;31:*.lzma=01;31:*.tlz=01;31:*.txz=01;31:*.tzo=01;31:*.t7z=01;31:*.zip=01;31:*.z=01;31:*.dz=01;31:*.gz=01;31:*.lrz=01;31:*.lz=01;31:*.lzo=01;31:*.xz=01;31:*.zst=01;31:*.tzst=01;31:*.bz2=01;31:*.bz=01;31:*.tbz=01;31:*.tbz2=01;31:*.tz=01;31:*.deb=01;31:*.rpm=01;31:*.jar=01;31:*.war=01;31:*.ear=01;31:*.sar=01;31:*.rar=01;31:*.alz=01;31:*.ace=01;31:*.zoo=01;31:*.cpio=01;31:*.7z=01;31:*.rz=01;31:*.cab=01;31:*.wim=01;31:*.swm=01;31:*.dwm=01;31:*.esd=01;31:*.jpg=01;35:*.jpeg=01;35:*.mjpg=01;35:*.mjpeg=01;35:*.gif=01;35:*.bmp=01;35:*.pbm=01;35:*.pgm=01;35:*.ppm=01;35:*.tga=01;35:*.xbm=01;35:*.xpm=01;35:*.tif=01;35:*.tiff=01;35:*.png=01;35:*.svg=01;35:*.svgz=01;35:*.mng=01;35:*.pcx=01;35:*.mov=01;35:*.mpg=01;35:*.mpeg=01;35:*.m2v=01;35:*.mkv=01;35:*.webm=01;35:*.ogm=01;35:*.mp4=01;35:*.m4v=01;35:*.mp4v=01;35:*.vob=01;35:*.qt=01;35:*.nuv=01;35:*.wmv=01;35:*.asf=01;35:*.rm=01;35:*.rmvb=01;35:*.flc=01;35:*.avi=01;35:*.fli=01;35:*.flv=01;35:*.gl=01;35:*.dl=01;35:*.xcf=01;35:*.xwd=01;35:*.yuv=01;35:*.cgm=01;35:*.emf=01;35:*.ogv=01;35:*.ogx=01;35:*.aac=00;36:*.au=00;36:*.flac=00;36:*.m4a=00;36:*.mid=00;36:*.midi=00;36:*.mka=00;36:*.mp3=00;36:*.mpc=00;36:*.ogg=00;36:*.ra=00;36:*.wav=00;36:*.oga=00;36:*.opus=00;36:*.spx=00;36:*.xspf=00;36: LESSCLOSE=/usr/bin/lesspipe %s %s TERM=xterm-256color LESSOPEN=| /usr/bin/lesspipe %s USER=drkslv SHLVL=1 WSLENV= XDG_DATA_DIRS=/usr/local/share:/usr/share:/var/lib/snapd/desktop PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/games:/usr/local/games:/mnt/c/Program Files/WindowsApps/CanonicalGroupLimited.Ubuntu20.04onWindows_2004.2020.812.0_x64__79rhkp1fndgsc:/mnt/c/program files/graphicsmagick-1.3.33-q16:/mnt/c/Program Files (x86)/Common Files/Oracle/Java/javapath:/mnt/c/Program Files (x86)/Intel/Intel(R) Management Engine Components/iCLS/:/mnt/c/Program Files/Intel/Intel(R) Management Engine Components/iCLS/:/mnt/c/Windows/system32:/mnt/c/Windows:/mnt/c/Windows/System32/Wbem:/mnt/c/Windows/System32/WindowsPowerShell/v1.0/:/mnt/c/Windows/System32/OpenSSH/:/mnt/c/Program Files (x86)/Intel/Intel(R) Management Engine Components/DAL:/mnt/c/Program Files/Intel/Intel(R) Management Engine Components/DAL:/mnt/c/Program Files (x86)/NVIDIA Corporation/PhysX/Common:/mnt/c/WINDOWS/system32:/mnt/c/WINDOWS:/mnt/c/WINDOWS/System32/Wbem:/mnt/c/WINDOWS/System32/WindowsPowerShell/v1.0/:/mnt/c/WINDOWS/System32/OpenSSH/:/mnt/c/Program Files/Intel/WiFi/bin/:/mnt/c/Program Files/Common Files/Intel/WirelessCommon/:/mnt/c/Program Files/nodejs/:/mnt/c/Program Files/dotnet/:/mnt/c/Program Files/PuTTY/:/mnt/c/Program Files/Git/cmd:/mnt/c/Users/kongr/.cargo/bin:/mnt/c/Users/kongr/AppData/Local/Programs/Python/Python37/Scripts/:/mnt/c/Users/kongr/AppData/Local/Programs/Python/Python37/:/mnt/c/Program Files/MySQL/MySQL Shell 8.0/bin/:/mnt/c/Users/kongr/node_modules/.bin:/mnt/c/Users/kongr/AppData/Local/Microsoft/WindowsApps:/mnt/c/Users/kongr/AppData/Local/Programs/Microsoft VS Code/bin:/mnt/c/FFmpeg/bin:/mnt/c/Users/kongr/AppData/Roaming/npm:/mnt/c/Users/kongr/AppData/Local/Programs/Python/Python38-32:/mnt/c/Users/kongr/AppData/Local/Programs/Python/Python38-32/Scripts:/mnt/c/Program Files/heroku/bin:/mnt/c/flutter/bin:/mnt/c/console:/snap/bin HOSTTYPE=x86_64 _=/usr/bin/ps

*/