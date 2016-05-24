Hi, this is a card game written in Node.

# Setup
You will need to install Node.js on your computer and npm install express, request and socket.io.

The settings.json file includes configuration options. Important ones are:
- ip/port: location of where your game is hosted; usually you can put your IPv4 address for ip
- playersFilePath: a path to a file that saves the online players
- numDecksInSingletonFTK: number of decks to be played, usually 1 is good for 1-4 players but 2 is good when you have more
- queueCap: number of players entering the queue before a game is formed

After you have the desired settings, run "node index.js" in your project directory and navigate to ip:port in your browser.

# How to Play
The first time you enter the game a manual pops up to explain the rules to you. You can reopen the manual by pressing the "Manual" button in the top left corner

Give yourself a name by opening the NewPlayer drop down on the top right corner.

Press the "Ready" button to enter the queue, when enough players join you will automatically be dealt cards.

Hover over the cards and click on them to have them stay hovering, press "Play" to play those selected cards. Invalid plays will be rejected.

Press "Pass" to pass turn, or wait until your turn timer runs out.

Press "Quit" to leave the game prematurely.

# Improvements
This was made when I had much less experience! So many improvements could be made:
- write a better README...
- write the code better (goes without saying)!
- not force users to give themselves names and generate random ids for them instead
- write less complex stuff in general
- better configuration systems
- and more
