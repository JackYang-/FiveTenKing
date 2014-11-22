var express = require('express');
var app = express();
var fs = require('fs');
var http = require('http').Server(app);
var io = require('socket.io')(http);
var ftk = require('./fivetenking.js');
var request = require('request');
var FTKUtil = require("./common/FTKUtil.js");
var FTKMessenger = require("./common/FTKMessenger.js");

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
var _numDecksForFTK = settings.numDecksInSingletonFTK ? settings.numDecksInSingletonFTK : 2;
var _FTKQueueCap = settings.queueCap ? settings.queueCap : 3;
var _metapointsIntegrationKey = settings.metakey ? settings.metakey : 'asdf';

//initializing utilities
var util = new FTKUtil.FTKUtil();

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
		console.log('Checking loaded players: ' + util.getDisplay(players[i]) + ".");
	}
}
else
{
	players = [];
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
var playerGameMap = {};

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
			playerSearchResult.ingame = false;
			playerSearchResult.inqueue = false;
			console.log(util.getDisplay(playerSearchResult) + ' has connected');
			socket.emit('set-name', playerSearchResult.name);
			socket.emit('log-message', 'Welcome back, ' + playerSearchResult.name + '.');
			socket.emit('log-message', 'Currently, ' + getOnlinePlayersCount() + ' player(s) are online');
			for (var i = 0; i < playerQueue.length; i ++)
			{
				if (playerQueue[i].player.ip === playerIP)
				{
					playerSearchResult.inqueue = true;
					break;
				}
			}
			if (!playerSearchResult.inqueue)
			{
				if (playerGameMap[playerIP])
				{
					console.log('Attempting to recover ' + util.getDisplay(playerSearchResult) + '.');
					socket.emit('log-message', 'Attempting to recover your last game session.');
					playerGameMap[playerIP].recoverSession(playerIP, socket);
					playerGameMap[playerIP].alertMessageToAll(playerSearchResult.name + ' has returned!', 'normal');
					playerGameMap[playerIP].updateOthersToAll();
					playerSearchResult.ingame = true;
				}
			}
		}
	}
	else //if player is not registered, then it's a new player
	{
		players.push({name: "NewPlayer", ip:playerIP, connected:true, ingame:false, inqueue:false});
		playerSearchResult = getPlayer(playerIP);
		console.log('a new player connected from ' + playerIP);
		socket.emit('set-name', 'NewPlayer');
		socket.emit('log-message', 'Hi there! To get started, give yourself a new name by editing your profile information in the top right dropdown. If you need help, please click on the manual to see the game rules.');
		socket.emit('first-visit');
	}
	
	//TODO: parse message to talk globally or to lobby
	socket.on('chat-message', function (msg) {
		io.emit('chat-message', playerSearchResult.name + ": " + msg);
	});
	
	socket.on('ftk-move', function (command, data, callback) {
		console.log('-------------------------------------------------------------------------------');
		console.log('Five Ten King command initiated from ' + util.getDisplay(playerSearchResult) + '.');
		if (!playerGameMap[playerIP])
		{
			socket.emit('error-message', 'Your game instance has expired or has become unavailable. Please refresh your page to look for a new game');
			return false;
		}
		var result = playerGameMap[playerIP].handleCommand(playerIP, command, data);
		if (!(result === true || result === false))
		{
			result = false;
		}
		callback(result);
		console.log('-------------------------------------------------------------------------------');
	});
	socket.on('player-quit-game', function () {
		if (!(playerSearchResult.ingame || playerSearchResult.inqueue))
		{
			socket.emit('error-message', 'You are not currently in a game or queue.');
			return;
		}
		else
		{
			if (playerSearchResult.inqueue)
			{
				for (var i = 0; i < playerQueue.length; i ++)
				{
					if (playerQueue[i].player.ip === playerIP)
					{
						playerQueue.splice(i, 1);
					}
				}
				playerSearchResult.inqueue = false;
				console.log(util.getDisplay(playerSearchResult) + ' has stopped queuing.');
				socket.emit('log-message', 'Stopped searching for opponents.');
				return;
			}
			if (playerSearchResult.ingame)
			{
				var gameInstanceInProgress = playerGameMap[playerIP];
				playerSearchResult.ingame = false;
				if (gameInstanceInProgress)
				{
					gameInstanceInProgress.endGame(playerIP);
					delete playerGameMap[playerIP];
					console.log(util.getDisplay(playerSearchResult) + ' has quit their game.');
					return;
				}
				else
				{
					socket.emit('error-message', 'Your game instance is unavailable or has expired. If you see this message then it\'s *probably* a bug. Please message help desk with your concerns. Kappa');
					return;
				}
			}
		}
	});
	socket.on('player-is-ready', function () {
		console.log(util.getDisplay(playerSearchResult) + " requests to play a new game.");
		if (!playerSearchResult.name)
		{
			console.log("Player name is screwed up");
			socket.emit('error-message', 'Please give yourself a new name before starting a match.');
			return;
		}
		if (playerSearchResult.name === 'NewPlayer')
		{
			console.log("Player needs a new name before playing.");
			socket.emit('error-message', 'Please give yourself a new name before starting a match.');
			return;
		}
		if (playerSearchResult.inqueue)
		{
			console.log(util.getDisplay(playerSearchResult) + " is already in queue.");
			socket.emit('error-message', 'Already in queue, please wait.');
			return;
		}
		else if (playerSearchResult.ingame)
		{
			console.log(util.getDisplay(playerSearchResult) + " is already in game.");
			socket.emit('error-message', 'Already in game, please wait until after your game is finished.');
			return;
		}
		playerQueue.push({player: playerSearchResult, socket: socket});
		playerSearchResult.inqueue = true;
		socket.emit('log-message', 'Searching for a match.');
		
		if (playerQueue.length >= _FTKQueueCap)
		{
			var playerList = [];
			var socketList = [];
			for (var i = 0; i < playerQueue.length; i ++) //message player for game found; assemble players for new game instance
			{
				//playerQueue[i].socket.emit('success-message', 'Match found!');
				socketList.push({ip: playerQueue[i].player.ip, socket: playerQueue[i].socket});
				playerList.push(playerQueue[i]);
			}
			var extraData = {httpRequestMaker: request, metakey: _metapointsIntegrationKey};
			var messenger = new FTKMessenger.FTKMessenger(io, socketList);
			var newGameInstance = new ftk.FiveTenKing(playerList, _numDecksForFTK, messenger, extraData);
			var playersInGame = [];
			for (var i = 0; i < playerList.length; i ++) //need to keep track of the games that the players are in
			{
				playersInGame.push(playerList[i].player.name);
				playerGameMap[playerList[i].player.ip] = newGameInstance;
			}
			newGameInstance.alertMessageToAll('Match found! The players in the room are: ' + playersInGame.join() + '.');
			playerQueue = [];
		}
	});
	
	socket.on('disconnect', function () {
		playerSearchResult.connected = false;
		playerSearchResult.ingame = false;
		playerSearchResult.inqueue = false;
		console.log(util.getDisplay(playerSearchResult) + ' has disconnected');
		for (var i = 0; i < playerQueue.length; i ++)
		{
			if (playerQueue[i].player.ip === playerIP)
			{
				playerQueue.splice(i, 1);
			}
		}
		if (playerGameMap[playerIP])
		{
			playerGameMap[playerIP].alertMessageToAll(playerSearchResult.name + " has just disconnected. Please wait for their return.", 'warning');
		}
	});
	socket.on('set-new-name', function(newName) {
		console.log(playerIP + ' namechange: from ' + playerSearchResult.name + ' to ' + newName);
		if (!newName)
		{
			console.log('name change was messed up');
			socket.emit('error-message', 'Name change failed.');
			return;
		}
		if (newName.length > 15)
		{
			console.log('name change had too many characters');
			socket.emit('error-message', 'Names can not be more than 15 characters long.');
			return;
		}
		for (var i = 0; i < newName.length; i ++)
		{
			var c = newName.charCodeAt(i);
			if (!((c >= 65 && c <= 90) || (c >= 97) && (c <= 122)))
			{
				console.log('name has bad characters');
				socket.emit('error-message', 'Name change failed. Please include only letters in your name.');
				return;
			}
		}
		if (newName === "NewPlayer" || newName === "")
		{
			console.log('trying to change name to unamed');
			socket.emit('error-message', 'Come on bro.');
		}
		else if (playerSearchResult.ingame)
		{
			console.log('trying to change name in game');
			socket.emit('error-message', 'Cannot change name while in game!');
		}
		else if (playerAttributeExists("name", newName))
		{
			console.log('name is in use');
			socket.emit('error-message', 'This name is already in use.');
		}
		else// if (setPlayerAttributes(playerIP, "name", newName))
		{
			playerSearchResult.name = newName;
			console.log('player name change succeeded');
			socket.emit('set-name', escapeHtml(newName));
			socket.emit('success-message', 'Name change successful.');
		}
		/*else
		{
			console.log('player name change failed');
			socket.emit('error-message', 'An error occurred while changing your name.');
		}*/
		
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

/*function setPlayerAttributes (ip, attribute, value)
{
	for (var i in players)
	{
		if (players[i].ip === ip)
		{
			if (attribute === "name" && !(value ==="NewPlayer"))
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
}*/

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