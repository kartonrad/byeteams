# byeteams
a small, way to colored cli script to leave teams after a certain time

## installation
1. Download and install Node.js 
(link: https://nodejs.org/en/download/)
2. run `npm install -g DRKSLV/byeteams` in a terminal to download/install the script
3. to execute the script run `byeteams <...>` or if that doesnt work, `npx byeteams <...>`

## note!!!!!!
When using the 'sleep' option, Windows will enter Hibernation Mode.
Moving the mouse won't wake it up, pressing the power button will work.

## Usage and Method
Example Commands
```shell
byeteams 3000 # leftclicks after 3000 milliseconds
byeteams 36000 # leftclicks after 1 hour, closes teams, and puts computer in hibernation mode
byeteams 1h sleep # same as above but more convenient
byeteams 1h-30min sleep # will leave and sleep after 90mins aka one lesson
```

![grafik](https://user-images.githubusercontent.com/56208328/106676219-c1836880-65b6-11eb-9cc9-579bbbc5a788.png)
