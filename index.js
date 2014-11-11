var express = require('express');
var app = express();
var fs = require('fs');
var http = require('http').Server(app);
var io = require('socket.io')(http);

app.use(express.static(__dirname + '/stuff'));
app.get('/', function(req, res){
	res.sendFile(__dirname + '/index.html');
});

//***************************************************************************************************************************
// Application code
//***************************************************************************************************************************

//apply settings
var settings = require("./settings.json");
var _listenPort = settings.port ? settings.port : '3000';
var _listenIP = settings.ip ? settings.ip : 'asdf';
var _playersFile = settings.playersFilePath ? settings.playersFilePath : './registeredPlayers.json';

//loading players
var currentUserData = require(_playersFile);
var players = null;
if (currentUserData)
{
	players = currentUserData;
	for (var i in players)
	{
		players[i].connected = false;
		players[i].inqueue = false;
		players[i].ingame = false;
		console.log('checking loaded players: ' + players[i].name + ' ' + players[i].ip);
	}
}
else
{
	players = {};
}

//regularly save current registered players
setInterval(function () {
	fs.writeFile("registeredPlayers.json", JSON.stringify(players), function(err) {
		if (err)
		{
			console.error("Error saving registered players");
		}
		else
		{
			console.log("Registered players have been saved.");
		}});
}, 60000);

//card game
var playerQueue = [];
var gamesInProgress = [];
var FiveTenKing = function (playersList, deckCount) 
{
	if (playersList.length <= 0 || deckCount <= 0)
	{
		console.log("Error: initializing 50k with 0 or fewer players or decks" + playersList.length + " " + deckCount);
		return;
	}
	for (var i = 0; i < playersList.length; i ++)
	{
		playersList[i].player.inqueue = false;
		playersList[i].player.ingame = true;
		playersList[i].hand = [];
	}
	this.players = playersList; //[{player: player, playerSocket: socket, hand: [{card: 'd3', value=0}]}]
	this.deckAssembleMapping = ["3", "4", "5", "6", "7", "8", "9", "10", "j", "q", "k", "1", "2"];
	this.suitMapping = ["d", "s", "h", "c"];
	this.dealersCards = []; //[{card: 'd3', value=0}]
	
	for (var i = 0; i < deckCount; i ++)
	{
		this.assembleDeck();
	}
	
	this.shuffleDeck();
	this.dealCards();
};
FiveTenKing.prototype.dealCards = function ()
{
	var playerCounterMax = this.players.length - 1;
	var playerCounter = 0;
	
	while (this.dealersCards.length > 0)
	{
		var card = this.getNextCard();
		this.players[playerCounter].hand.push(card);
		console.log('Player ' + playerCounter + ' was dealt: ' + card.card);
		this.players[playerCounter].playerSocket.emit('ftk-dealt-card', card);
		//this.players[playerCounter].playerSocket.emit('log-message', 'Card dealt: ' + card.card);
		playerCounter ++;
		if (playerCounter > playerCounterMax)
		{
			playerCounter = 0;
		}
	}
	
	for (var i = 0; i < this.players.length; i ++)
	{
		this.players[i].playerSocket.emit('ftk-dealing-finished');
	}
}
FiveTenKing.prototype.getNextCard = function () //NOTE: this function alters the length of the deck
{
	if (this.dealersCards.length > 0)
	{
		var card = this.dealersCards.splice(0, 1);
		return card[0];
	}
	else
	{
		return false;
	}
}
FiveTenKing.prototype.shuffleDeck = function ()
{
	for (var i = 0; i < this.dealersCards.length - 1; i ++)
	{
		var range = this.dealersCards.length - 1 - i;
		var newIndex = Math.floor(Math.random() * range) + i + 1;
		var temp = this.dealersCards[i];
		this.dealersCards[i] = this.dealersCards[newIndex];
		this.dealersCards[newIndex] = temp;
	}
}
FiveTenKing.prototype.assembleDeck = function()
{
	for (var j = 0; j < this.deckAssembleMapping.length; j ++)
	{
		for (var k = 0; k < this.suitMapping.length; k ++)
		{
			this.dealersCards.push({card: this.suitMapping[k] + this.deckAssembleMapping[j], value: j});
		}
	}
	this.dealersCards.push({card: "jb", value: this.deckAssembleMapping.length});
	this.dealersCards.push({card: "jr", value: (this.deckAssembleMapping.length + 1)});
}

//handling socket requests
io.on('connection', function(socket){
	var playerIP = socket.handshake.address;
	var playerSearchResult = getPlayer(playerIP);
	if (playerSearchResult)
	{
		//if player is registered & not connected, then they have "returned"
		if (!playerSearchResult.connected)
		{
			playerSearchResult.connected = true;
			console.log(playerSearchResult.name + '(' + playerIP + ')' + ' has connected');
			socket.emit('set-name', playerSearchResult.name);
			socket.emit('log-message', 'Welcome back, ' + playerSearchResult.name + '.');
			socket.emit('log-message', 'Currently, ' + getOnlinePlayersCount() + ' player(s) are online');
		}
	}
	else //if player is not registered, then it's a new player
	{
		players.push({name: "UnamedPlayer", ip:playerIP, connected:true});
		console.log('a new player connected from ' + playerIP);
		socket.emit('set-name', 'Click me! <span class="caret"></a>');
		socket.emit('log-message', 'Hi there! To get started, give yourself a new name by editing your profile information in the top right dropdown.');
		socket.emit('log-message', 'If this is your first time, please refer to the rule book in the top bar.');
	}
	
	socket.on('player-is-ready', function () {
		console.log(playerSearchResult.name + "(" + playerSearchResult.ip + ") requests to play a new game.");
		if (playerSearchResult.inqueue)
		{
			console.log(playerSearchResult.name + "(" + playerSearchResult.ip + ") is already in queue.");
			socket.emit('log-message', 'Already in queue, please wait.');
			return;
		}
		else if (playerSearchResult.ingame)
		{
			console.log(playerSearchResult.name + "(" + playerSearchResult.ip + ") is already in game.");
			socket.emit('log-message', 'Already in game, please wait until after your game is finished.');
			return;
		}
		playerQueue.push({player: playerSearchResult, playerSocket: socket});
		playerSearchResult.inqueue = true;
		socket.emit('log-message', 'Searching for a match.');
		if (playerQueue.length >= 1) //change this to appropriate number
		{
			var playerList = [];
			for (var i = 0; i < playerQueue.length; i ++)
			{
				playerQueue[i].playerSocket.emit('log-message', 'Match found!');
				playerList.push(playerQueue[i]);
			}
			gamesInProgress.push(new FiveTenKing(playerList, 1));
			playerQueue = [];
		}
	});
	
	socket.on('disconnect', function () {
		playerSearchResult.connected = false;
		playerSearchResult.ingame = false;
		playerSearchResult.inqueue = false;
		console.log('the player ' + playerSearchResult.name + '(' + playerIP + ') has disconnected');
	});
	socket.on('set-new-name', function(newName) {
		console.log(playerIP + ' namechange: from ' + playerSearchResult.name + ' to ' + newName);
		if (newName === "UnamedPlayer" || newName === "")
		{
			console.log('trying to change name to unamed');
			socket.emit('log-message', 'Come on bro.');
		}
		else if (playerSearchResult.ingame)
		{
			console.log('trying to change name in game');
			socket.emit('log-message', 'Cannot change name while in game!');
		}
		else if (playerAttributeExists("name", newName))
		{
			console.log('name is in use');
			socket.emit('log-message', 'This name is already in use.');
		}
		else if (setPlayerAttributes(playerIP, "name", newName))
		{
			console.log('player name change succeeded');
			socket.emit('set-name', escapeHtml(newName));
			socket.emit('log-message', 'Name change successful.');
		}
		else
		{
			console.log('player name change failed');
			socket.emit('log-message', 'An error occurred while changing your name.');
		}
		
	});
});

//***************************************************************************************************************************
// Helpers
//***************************************************************************************************************************
function escapeHtml(text) {
  var map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };

  return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}

function playerAttributeExists(attribute, value)
{
	for (var i in players)
	{
		if (attribute === "name" && players[i].name === value)
		{
			return true;
		}
	}
	return false;
}

function setPlayerAttributes (ip, attribute, value)
{
	for (var i in players)
	{
		if (players[i].ip === ip)
		{
			if (attribute === "name" && !(value ==="UnamedPlayer"))
			{
				players[i].name = value;
			}
			else if (attribute === "connected")
			{
				players[i].connected = value;
			}
			return true;
		}
	}
	return false;
}

function getOnlinePlayersCount()
{
	var count = 0;
	for (var i in players)
	{
		if (players[i].connected)
		{
			count ++;
		}
	}
	return count;
}

function getPlayer (ip)
{
	for (var i in players)
	{
		if (players[i].ip === ip)
		{
			return players[i];
		}
	}
	return false;
}

http.listen(_listenPort, _listenIP, function(){
  console.log('listening on *:3000');
});