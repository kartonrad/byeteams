#!/usr/bin/env node

const robot = require("robotjs");
const {exec} = require("child_process");
const chalk = require("chalk");
const putToSleep = process.argv[3] === "sleep"

const readline = require('readline');
var exitingGOODBYE = false;


//GREETING
console.log(chalk.blueBright(`
/-----------------\\
| BYE BYE TEAMS!! |
\\-----------------/`));

console.log(
chalk`
{green ----------HELP----------}
{bgGrey Usage:} byeteams {yellow <time> <sleep>}
{grey Time: } {magenta 1d-2h-3m-1s}        (number of [days, hours etc..] seperated by '-')
{grey Sleep:} {magenta sleep} {grey (optional)}   pass 'sleep' to Taskkill Teams and put computer to sleep.
`
)



//PARSING TIMESTRING
var timestrings = (process.argv[2] || "").split(/[\s-]/g);
var waitInMs = 0;

timestrings.forEach((ts)=> {
    var tsx=ts.substr(0, ts.length-1);
    var float = Number.parseFloat(tsx)
    if(Number.isNaN(float)) return;
    switch(ts[ts.length-1]) {
        case "s":
            waitInMs += float * 1000;
        break;
        case "m": 
            waitInMs += float * 60000;
        break;
        case "h":
            waitInMs += float * 3600000;
        break;
        case "d":
            waitInMs += float * 86400000;
        break;
        default:
            waitInMs +=  Number.parseInt(ts)||0
    }
});
if(waitInMs > 2147483647) waitInMs = 2147483647;
waitInMs = Math.round(waitInMs);

//EXPLANATION
console.log(chalk`{yellow ----------SETUP---------}
{bold ByeTeams®} will now:`);
logTime(waitInMs, chalk`{grey 1.} Wait for `);
console.log(chalk`{grey 2.} Automatically left-Click to leave the Meeting \n    {grey (Remember to hover over the {white.bgRed.bold 📞LEAVE} Button)}`);
if(putToSleep) {
    console.log(chalk`{grey 3.} Find and {red.italic kill} Teams.exe
{grey 4.} Put your PC to sleep 💤`);
}
console.log(chalk`{grey ${putToSleep?5:3}.} aaaand that's it!
`)

//ASK CONFIRM
console.log(chalk`

{green Press {italic Enter} to confirm and continue!}
{grey If you're reconsidering your life coices, type 'stop' and hit enter
You can quit at {bold any}time by hitting {red CTRL+C} or {red CTRL+X}}`)
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
rl.question(chalk`{green CONFIRM}>>`, (answer) => {
    rl.close();
    if(answer.includes("stop") || answer.includes("s") || answer.includes("S")) {
    process.exit(1);
    }

    run();
});

function run() {
    console.log(chalk`\n\n{red ---------RUNNING--------}`);

    //WAITING TO CLICK
    setTimeout(async () => {
        process.stdout.write(chalk`{red [LEAVING]} clicking...`)
        robot.mouseClick("left");
        console.log(chalk.green("done!"))
        clearInterval(int);
        
        if(putToSleep) {
            console.log(chalk`{grey [WAITING]} sleeping+killing in 10 seconds`);
            var cnt = 10;
            var b = setInterval(() => {
                process.stdout.write("\x1b[F\x1b[2K");
                cnt-=1;
                console.log(chalk`{grey [WAITING]} sleeping+killing in ${cnt} seconds`);
            }, 1000)
            await sleep(b);
            exitingGOODBYE = true
            console.log(chalk`{yellow [GOODBYE]} waking up again! so exicted! \n hope this worked\n if not tweet at me ({blueBright @darksilvian}) or open an issue`)
        }
        
    }, waitInMs);

    //LOG PROGRESS
    logTime(waitInMs, chalk`{grey [WAITING]} Clicking in:`);
    var left = waitInMs;
    var lastTime = new Date().getTime();
    var int = setInterval (() => {
        var now =  new Date().getTime();
        left = left-(now-lastTime);
        process.stdout.write("\x1b[F\x1b[2K");
        logTime(left, chalk`{rgb(255,156,0) [WAITING]} Clicking in:`); 
        lastTime= now;
    }, 5000);
}


//FUNCTIONS -------
//GO TO SLEEP
function sleep(b) {
    return new Promise((resolve, reject) => 
        setTimeout(() => {
            clearInterval(b);
            process.stdout.write("\x1b[F\x1b[2K");
            console.log(chalk`{grey [WAITING]} sleeping+killing in 0 seconds`);

            console.log(chalk`{red [{italic KILLING}]} Closing all instances of {blueBright.bold Teams}`)
            console.log(chalk`{blue [SLEEPING]} hibernating...`);

            //platform specific commands
            var cmd;
            if(process.platform === "win32") cmd = 'echo bruh'; //'taskkill /t /IM teams.exe /f & rundll32.exe powrprof.dll,SetSuspendState 0,1,0;';
            else if (process.platform === "darwin") cmd = 'killall Teams; killall teams; pmset sleepnow;'
            else cmd = 'killall Teams; killall teams; systemctl suspend;';

            setTimeout(() => 
                exec(
                    cmd
                , (err, stdout, stderr) => {
                    stdout.split("\n").forEach((msg) =>{ if(msg) console.log(chalk`{grey [OS:LOGS] ${msg}}`)});
                    stderr.split("\n").forEach((msg) =>{ if(msg) console.log(chalk`{red [OS:ERRORS] ${msg}}`)});
                    resolve();
                })
            , 2000)
        }
        , 10000)
    );
}
//FORMAT TIME
function logTime(time, msg) {
    var {days, hours, mins, secs, milis } = humanDuration(time)

    console.log(
    chalk`${msg||"Time"}: `+
    chalk`{blue ${     days?days.toString().padStart(2," ") +"d":"..."}} ` +
    chalk`{green ${  hours?hours.toString().padStart(2," ") +"h":"..."}} ` +
    chalk`{yellow ${   mins?mins.toString().padStart(2," ") +"m":"..."}} ` + 
    chalk`{red ${      secs?secs.toString().padStart(2," ") +"s":"..."}} ` +
    chalk`{magenta ${milis?milis.toString().padStart(3," ") +"ms":"....."}}`
    )
}

function humanDuration(time) {
    var [days, carry] = extractTimeUnit(time, 86400000);
    var [hours, carry] = extractTimeUnit(carry, 3600000);
    var [mins, carry] = extractTimeUnit(carry, 60000);
    var [secs, carry] = extractTimeUnit(carry, 1000);

    var duration = {days, hours, mins, secs, milis: carry};
    return duration;
}
function extractTimeUnit(time, unitInMs) {
    var units = Math.floor(time/unitInMs);
    var carry = time - (units*unitInMs);

    return [units, carry];
}

process.on("exit", () => {
    if(exitingGOODBYE) return;

    console.log(chalk`\n{red [ABORTING]} ahhhhhh! aborting!!
if there was a problem or smth is unclear, tweet at me ({blueBright @darksilvian}) or open an issue`);
    process.exit(1);
})