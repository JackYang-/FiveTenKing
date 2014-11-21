(function () {
var FiveTenKing = function (playersList, deckCount, messenger, extraData) 
{
	//initializing components and utilities
	var FTKUtil = require("./common/FTKUtil.js");
	var util = new FTKUtil.FTKUtil();
	var FTKDealer = require("./components/FTKDealer.js");
	var FTKPlayChecker = require("./components/FTKPlayChecker.js");
	
	//privatize this one
	this.playChecker = new FTKPlayChecker.FTKPlayChecker();
	if (playersList.length <= 0 || deckCount <= 0)
	{
		console.log("Error: initializing 50k with 0 or fewer players or decks" + playersList.length + " " + deckCount);
		return;
	}
	var playerIPMap = {};
	var nextPlayerMap = {};
	var playersInRoom = "";
	for (var i = 0; i < playersList.length; i ++)
	{
		playersList[i].player.inqueue = false;
		playersList[i].player.ingame = true;
		playersList[i].hand = [];
		playersInRoom += playersList[i].player.name + ", ";
		
		var currentIP = playersList[i].player.ip;
		playerIPMap[currentIP] = playersList[i];
		if (i < playersList.length - 1)
		{
			nextPlayerMap[currentIP] = playersList[i + 1];
		}
		else
		{
			nextPlayerMap[currentIP] = playersList[0];
		}
	}
	this.messenger = messenger;
	this.httpRequest = extraData.httpRequestMaker;
	this.metakey = extraData.metakey;
	this.hasFirstWinner = false;
	this.players = playersList; //[{player: player, socket: socket, hand: [{card: 'd3', suit='d', value=0}]}]
	this.allPlayersString = playersInRoom;
	this.playerAtIP = playerIPMap; //{ "ip": an element of playerlist ^ }
	this.playerAfterIP = nextPlayerMap; //{ "ip": next player's ip }
	this.turnOwnerIP = "";
	//this.lastPlay = {type: this.playChecker.playTypes.NoPlay, strength: 0, length: 0};
	this.lastPlay = this.playChecker.getNoPlay();
	this.lastPlayMaker = "";
	this.turnOwnerNotificationCount = 0;
	this.turnOwnerNotifier = "";
	this.latestPlayCards = [];
	this.gameOver = false;
	
	var dealer = new FTKDealer.FTKDealer(deckCount);
	var firstTurnOwner = dealer.dealCards(this.players);
	if (!firstTurnOwner)
	{
		console.log("ERROR: first turn owner not initialized.");
		return;
	}
	this.turnOwnerIP = firstTurnOwner;
	//this.notifyUntilMoveOrPass(this.turnOwnerIP);
};
FiveTenKing.prototype.endGame = function (ip) {
	console.log("The player " + this.playerAtIP[ip].player.name + "(" + ip + ") has quit the game. If the game is already over, then nothing else will happen. Otherwise, this game is now over.");
	this.alertMessageToAll(this.playerAtIP[ip].player.name + " has quit the game. It is now safe to leave. Use the Quit button to exit this lobby and the Ready button to look for a new game.");
	this.gameOver = true;
}
FiveTenKing.prototype.hasCards = function (ip, cardsToPlay)
{
	var playerHand = this.playerAtIP[ip].hand;
	var foundSoFar = [];
	for (var i = 0; i < cardsToPlay.length; i ++)
	{
		var cardFound = false;
		for (var j = 0; j < playerHand.length && !cardFound; j ++)
		{
			if (playerHand[j].card === cardsToPlay[i].card && foundSoFar.indexOf(j) === -1)
			{
				foundSoFar.push(j);
				cardFound = true;
			}
		}
		if (!cardFound)
		{
			return false;
		}
	}
	return true;
}
FiveTenKing.prototype.removeCards = function (ip, cardsToRemove)
{
	var playerHand = this.playerAtIP[ip].hand;
	var numCardsRemoved = 0;
	for (var i = 0; i < cardsToRemove.length; i ++)
	{
		for (var j = 0; j < playerHand.length; j ++)
		{
			if (playerHand[j].card === cardsToRemove[i].card && !(playerHand[j].card === "REMOVE"))
			{
				playerHand[j].card = "REMOVE";
				break;
			}
		}
	}
	for (var i = playerHand.length - 1; i >= 0; i --)
	{
		if (playerHand[i].card === "REMOVE")
		{
			playerHand.splice(i, 1);
			numCardsRemoved ++;
		}
	}
	return numCardsRemoved;
}
FiveTenKing.prototype.goNextTurn = function (ip, type)
{
	if (!type)
	{
		type = 'passing';
	}
	console.log("goNextTurn called by " + ip + "; type: " + type);
	
	if (this.turnOwnerNotifier)
	{
		clearTimeout(this.turnOwnerNotifier);
	}	
	if (!(this.turnOwnerIP === ip))
	{
		this.playerAtIP[ip].socket.emit('error-message', 'Cannot pass because it is not currently your turn to play.');
		return false;
	}
	if (type === 'passing' && this.lastPlayMaker === "" && !(this.turnOwnerNotificationCount >= 3))
	{
		this.playerAtIP[ip].socket.emit('error-message', 'Cannot pass on your own turn if there is no play to pass on.');
		return false;
	}
	
	var allCardsPlayed = true;
	for (var i = 0; i < this.players.length; i ++)
	{
		if (!(this.players[i].hand.length === 0))
		{
			console.log("Not all cards have been played, game will continue.");
			allCardsPlayed = false;
		}
	}
	if (allCardsPlayed)
	{
		console.log("No more cards left, game will end.");
		this.alertMessageToAll("The game is over! Use the Quit button to exit this lobby and the Ready button to find a new game.", "success");
		this.gameOver = allCardsPlayed;
		return true;
	}
	
	var newTurnOwnerIP = this.playerAfterIP[ip].player.ip;
	console.log("next player ip: " + newTurnOwnerIP);
	if (!this.gameOver)
	{
		var numTimesSkipped = 0;
		if (newTurnOwnerIP === this.lastPlayMaker) //wipe cards in play if new turn owner is playing on top of his last play
		{
			console.log("everyone passed on " + this.lastPlayMaker + "'s play, so now it's his turn again");
			this.lastPlayMaker = "";
			this.lastPlay = this.playChecker.getNoPlay();//{type: this.playChecker.playTypes.NoPlay, strength: 0, length: 0};
			this.clearDisplayToAll();
		}
		
		while (this.playerAtIP[newTurnOwnerIP].hand.length === 0) //if the new turn is for a player who has won, then their turn is skipped
		{
			console.log(this.playerAtIP[newTurnOwnerIP].player.name + "(" + newTurnOwnerIP + ") has already finished playing their hand. So their turn will be skipped");
			newTurnOwnerIP = this.playerAfterIP[newTurnOwnerIP].player.ip;
			if (newTurnOwnerIP === this.lastPlayMaker) //wipe cards in play if new turn owner is playing on top of his last play
			{
				console.log("everyone passed on " + this.lastPlayMaker + "'s play, so now it's his turn again");
				this.lastPlayMaker = "";
				this.lastPlay = this.playChecker.getNoPlay();//{type: this.playChecker.playTypes.NoPlay, strength: 0, length: 0};
				this.clearDisplayToAll();
			}
			numTimesSkipped ++;
			if (numTimesSkipped > this.players.length)
			{
				console.log('THIS IS PROBABLY A BUG: all players have finished playing the but the game isnt yet over.');
				break;
			}
		}
		if (newTurnOwnerIP === this.turnOwnerIP) //this will log a warning if new turn owner is the same as current turn owner
		{
			console.log("warning: the player after the current player is the current player himself; not a bug if only 1 player is in game");
			this.lastPlayMaker = "";
			this.lastPlay = this.playChecker.getNoPlay();//{type: this.playChecker.playTypes.NoPlay, strength: 0, length: 0};
			this.clearDisplayToAll();
		}
		this.turnOwnerIP = newTurnOwnerIP;
		if (type === 'passing')
		{
			this.alertMessageToAll(this.playerAtIP[ip].player.name + " has passed.", "normal");
		}
		
		this.alertMessageToAll("Now it's " + this.playerAtIP[newTurnOwnerIP].player.name + "'s turn.", "normal");
		this.sendDesktopNotification(newTurnOwnerIP, 'Hey, it\'s your turn!');
		this.turnOwnerNotificationCount = 0;
		//this.notifyUntilMoveOrPass(newTurnOwnerIP);
		
		return true;
	}
	else 
	{
		return false;
	}
}
FiveTenKing.prototype.recoverSession = function (ip, newSocket)
{
	var recoveringPlayer = this.playerAtIP[ip];
	recoveringPlayer.socket = newSocket;
	console.log('Attempting to recover ' + recoveringPlayer.player.name + '(' + recoveringPlayer.player.ip + ').');
	var hand = this.playerAtIP[ip].hand;
	recoveringPlayer.socket.emit('ftk-recover-game-session');
	console.log('Hand length: ' + hand.length);
	for (var i = 0; i < hand.length; i ++)
	{
		console.log('Dealing card: ' + hand[i].card);
		recoveringPlayer.socket.emit('ftk-dealt-card', hand[i]);
	}
	recoveringPlayer.socket.emit('ftk-dealing-finished');
	
	recoveringPlayer.socket.emit('log-message', 'It is currently ' + this.playerAtIP[this.turnOwnerIP].player.name + '\'s turn.');
	if (this.lastPlayMaker)
	{
		console.log('Last play maker: ' + this.lastPlayMaker);
		var latestPlay = this.latestPlayCards;
		recoveringPlayer.socket.emit('ftk-latest-play', latestPlay);
		recoveringPlayer.socket.emit('log-message', 'The last play was made by ' + this.playerAtIP[this.lastPlayMaker].player.name + '.');
	}
	else
	{
		console.log('No plays on the field at the moment.');
		recoveringPlayer.socket.emit('ftk-clear-display');
	}
}
FiveTenKing.prototype.clearDisplayToAll = function ()
{
	this.messenger.SendToAll('ftk-clear-display');
}
FiveTenKing.prototype.alertMessageToAll = function (message, type)
{
	this.messenger.SendMessageToAll(message, type);
}
FiveTenKing.prototype.alertPlayToAll = function (cardsToPlay)
{
	if (this.gameOver)
	{
		console.log("A play was sent, but the game is over.");
		return;
	}
	this.latestPlayCards = cardsToPlay;
	this.messenger.SendToAll('ftk-latest-play', cardsToPlay);
}
FiveTenKing.prototype.updateOthersToAll = function ()
{
	if (this.gameOver)
	{
		console.log("Blocking updates to the others cards field because game is over.");
		return;
	}
	console.log("Attempting to updates the others cards field for all players.");
	for (var i = 0; i < this.players.length; i ++)
	{
		var thisPlayer = this.players[i];
		var handCountsForThisPlayer = [];
		for (var j = 0; j < this.players.length; j ++)
		{
			if (!(this.players[j].player.ip === thisPlayer.player.ip))
			{
				handCountsForThisPlayer.push({name: this.players[j].player.name, numCards: this.players[j].hand.length});
			}
		}
		thisPlayer.socket.emit('ftk-update-others', handCountsForThisPlayer);
	}
}
FiveTenKing.prototype.sendDesktopNotification = function (ip, message)
{
	if (this.gameOver)
	{
		console.log("Blocked notification with message [" + message + "] from being sent because the game is over.");
		return;
	}
	this.messenger.SendNotificationToIP(ip, message);
}
FiveTenKing.prototype.handlePlay = function (ip, cardsToPlay)
{
	if (!(this.turnOwnerIP === ip))
	{
		console.log(this.playerAtIP[ip].player.name + "(" + ip + ") requested to play when it's not their turn. " + this.playerAtIP[this.turnOwnerIP] + "(" + this.turnOwnerIP + ") has the turn.");
		this.playerAtIP[ip].socket.emit('error-message', 'It is not currently your turn to play.');
		return false;
	}
	console.log('Incoming request is coming from the turn owner.');
	if (!(this.hasCards(ip, cardsToPlay)))
	{
		console.log('Turn owner\'s proposed play did not match with hand');
		this.playerAtIP[ip].socket.emit('error-message', 'You are trying to make a play with cards you don\'t have!');
		return false;
	}
	console.log('Turn owner\'s proposed play matched with hand.');

	var playResult = this.playChecker.calculatePlay(cardsToPlay);
	if (!(this.playChecker.isValidPlay(playResult)))
	{
		console.log("Play failed to evaluate.");
		return false;
	}
	if (!(this.playChecker.firstTrumpsSecond(playResult, this.lastPlay)))
	{
		console.log("New play did not trump old play.");
		return false;
	}
	console.log("new " + playResult.type.name + " play trumps old play");
	this.lastPlay = playResult;
	this.lastPlayMaker = ip;
	var numRemovedCards = this.removeCards(ip, cardsToPlay); //remove the played cards from player's hanad
	if (!(numRemovedCards === cardsToPlay.length))
	{
		console.log("an error occurred while removing cards from player's hand; " + numRemovedCards + " were removed but " + cardsToPlay.length + " cards were played");
		this.playerAtIP[ip].socket.emit('error-message', 'An error occurred while processing your play.');
		return false;
	}
	console.log(this.playerAtIP[ip].player.name + "(" + ip + ") just finished making the play.");
	this.alertMessageToAll(this.playerAtIP[ip].player.name + " just made a play. They now have " + this.playerAtIP[ip].hand.length + " cards left in their hand.", "warning");
	this.updateOthersToAll();
	if (this.playerAtIP[ip].hand.length <= 0)
	{
		console.log("They won the game.");
		this.alertMessageToAll(this.playerAtIP[ip].player.name + " has won! Congratulations.", "success");
		if (!this.hasFirstWinner)
		{
			console.log("This is the first winner of this match. Preparing to send metapoints if integration exists.");
			this.hasFirstWinner = true;
			if (this.metakey)
			{
				var url = 'http://10.4.3.180:1338/integrations';
				var headers = {
					'metakey': this.metakey
				};
				var form = { "ip": ip, "reason": "winning a game" };
				this.httpRequest.post({ url: url, json: form, headers: headers }, 
						function (err, response, body)
						{
							if (err)
							{
								console.log('request failed');
							}
							console.log('-------------------');
							console.log("callback from metapoints received");
							console.log('-------------------');
						});		
			}				
		}
		else
		{
			console.log("This is not the first winner of this match.");
		}
	}
	this.alertPlayToAll(cardsToPlay);
	
	return this.goNextTurn(ip, 'finished-play');
}
//TODO: data sanity checks and send a token to the client to prevent it from sending bad requests
FiveTenKing.prototype.handleCommand = function (ip, command, data)
{
	console.log('Five Ten King received command');
	if (this.gameOver)
	{
		console.log('Not accepting commands anymore since game is over.');
		return false;
	}
	switch (command)
	{
		case 'ftkcmd-make-play':
			console.log('ftkcmd-make-play has been called');
			return this.handlePlay(ip, data);
			break;
		case 'ftkcmd-pass-turn':
			console.log('ftkcmd-pass-turn has been called');
			return this.goNextTurn(ip);
			break;
		default:
			return false;
	}
}

module.exports.FiveTenKing = FiveTenKing;

}());

// FiveTenKing.prototype.notifyUntilMoveOrPass = function (ip)
// {
	// if (this.gameOver)
	// {
		// console.log("Trying to nofity someone until move or pass, but the game is over.");
		// return;
	// }
	// var $this = this;
	// //var playerToNotify = this.playerAtIP[ip];
	// this.turnOwnerNotifier = setTimeout(function () {
		// if ($this.gameOver)
		// {
			// return;
		// }
		// console.log("Reminding " + $this.playerAtIP[ip].player.name + "(" + ip + ") to make a move.");
		// $this.sendDesktopNotification(ip, 'You might want to make a move soon, or your turn will be skipped!');
		// $this.turnOwnerNotificationCount ++;
		// if ($this.turnOwnerNotificationCount >= 3)
		// {
			// console.log($this.playerAtIP[ip].player.name + "(" + ip + ") has been idle for too long; their turn will be skipped.");
			// $this.goNextTurn(ip, 'passing');
			// return;
		// }
		// else
		// {
			// $this.notifyUntilMoveOrPass(ip);
		// }
	// }, 10000);
// }