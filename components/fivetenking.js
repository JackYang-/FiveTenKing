(function () {
var FiveTenKing = function (playersList, deckCount, newMessenger, extraData) 
{
	if (playersList.length <= 0 || deckCount <= 0)
	{
		console.log("Error: initializing 50k with 0 or fewer players or decks" + playersList.length + " " + deckCount);
		return;
	}

	//initializing components and utilities
	var FTKUtil = require("../common/FTKUtil.js");
	var FTKDealer = require("./FTKDealer.js");
	var FTKPlayChecker = require("./FTKPlayChecker.js");
	var util = new FTKUtil.FTKUtil();
	var dealer = new FTKDealer.FTKDealer(deckCount);
	var playChecker = new FTKPlayChecker.FTKPlayChecker();
	
	//initializing game logic variables
	var playerAtIP = {}; //hashtable for finding players based on their ip
	var playerAfterIP = {}; //hashtable for finding players that play after another player's ip
	var playersInRoom = []; //an array of the names of the players in the room
	for (var i = 0; i < playersList.length; i ++)
	{
		playersList[i].player.inqueue = false;
		playersList[i].player.ingame = true;
		playersList[i].hand = [];
		playersInRoom.push(playersList[i].player.name);
		
		var currentIP = playersList[i].player.ip;
		playerAtIP[currentIP] = playersList[i];
		if (i < playersList.length - 1)
		{
			playerAfterIP[currentIP] = playersList[i + 1];
		}
		else
		{
			playerAfterIP[currentIP] = playersList[0];
		}
	}
	var messenger = newMessenger; //the messenger is used to communicate with the players in the room via socketio
	var players = playersList; //[{player: player, socket: socket, hand: [{card: 'd3', suit='d', value=0}]}]
	var lastPlay = playChecker.getNoPlay(); //this stores the calculated result of the last play; for more details check out FTKPlayChecker.js
	var lastPlayMaker = ""; //ip of the player who last played
	var latestPlayCards = []; //the list of cards in the last play
	var gameOver = false; //gameOver prevents the lobby from communicating with players after the game is done; it is set when everyone finished playing or someone quits prematurely
	var gamePaused = false; //the game pauses when a player disconnects
	var turnSkipper = "";
	
	//metapoints integration https://github.com/msrose/metapoints
	var hasFirstWinner = false; //first winner of the game wins 500 metapoints
	var httpRequest = extraData.httpRequestMaker;
	var metakey = extraData.metakey;

	
	var firstTurnOwner = dealer.dealCards(players);
	if (!firstTurnOwner)
	{
		console.log("ERROR: first turn owner not initialized.");
		return;
	}
	var turnOwnerIP = firstTurnOwner;
	startCountdown(30000);
	
		
	//Summary: called when a player quits to end the game.
	this.endGame = function (ip) 
	{
		console.log("The player " + util.getDisplay(playerAtIP[ip].player) + " has quit the game. If the game is already over, then nothing else will happen. Otherwise, this game is now over.");
		messenger.sendMessageToAll(playerAtIP[ip].player.name + " has quit the game. It is now safe to leave. Use the Quit button to exit this lobby and the Ready button to look for a new game.");
		gameOver = true;
	}
	
	//Summary: attempts to re-add a player who has disconnected back into their game by updating their socket and refreshing their ui elements
	this.recoverSession = function (ip, newSocket)
	{
		var recoveringPlayer = playerAtIP[ip];
		if (!recoveringPlayer)
		{
			console.log("RecoverSession ERROR: the player attempting to recover cannot be found.");
		}
		recoveringPlayer.socket = newSocket;
		messenger.Add(newSocket);
		if (gameOver)
		{
			messenger.sendToIP(ip, 'error-message', "The game you were in is now over. Click ready to start a new game.");
			return;
		}
		recoveringPlayer.player.inqueue = false;
		recoveringPlayer.player.ingame = true;
		console.log("Attempting to recover " + util.getDisplay(recoveringPlayer.player) + ".");
		var hand = playerAtIP[ip].hand;
		recoveringPlayer.socket.emit('ftk-recover-game-session');
		console.log('Hand length: ' + hand.length);
		for (var i = 0; i < hand.length; i ++)
		{
			console.log('Dealing card: ' + hand[i].card);
			messenger.sendToIP(ip, 'ftk-dealt-card', hand[i]);
		}
		messenger.sendToIP(ip, 'ftk-dealing-finished');
		
		messenger.sendToIP(ip, 'log-message', 'It is currently ' + playerAtIP[turnOwnerIP].player.name + '\'s turn.');
		if (lastPlayMaker)
		{
			console.log('Last play maker: ' + lastPlayMaker);
			var latestPlay = latestPlayCards;
			messenger.sendToIP(ip, 'ftk-latest-play', latestPlay);
			messenger.sendToIP(ip, 'log-message', 'The last play was made by ' + playerAtIP[lastPlayMaker].player.name + '.');
		}
		else
		{
			console.log('No plays on the field at the moment.');
			messenger.sendToIP(ip, 'ftk-clear-display');
		}
		gamePaused = false;
		startCountdown(30000);
		messenger.sendMessageToAll(recoveringPlayer.player.name + " has returned.", "success");
	}
	
	//Summary: informs the game instance that a player has disconnected. The game will be paused (no commands accepted) until the player returns.
	this.alertDisconnect = function (ip)
	{
		var disconnectedPlayer = playerAtIP[ip];
		if (!disconnectedPlayer)
		{
			console.log("Notified that a player has been disconnected but the player cannot be found.");
			return;
		}
		messenger.sendMessageToAll(disconnectedPlayer.player.name + " has just disconnected. The game will now be paused. Please wait for their return. You may quit the game by clicking on the Quit button.", "warning");
		if (turnOwnerIP)
		{
			messenger.sendToIP(turnOwnerIP, 'ftk-end-countdown');
		}
		clearTimeout(turnSkipper);
		gamePaused = true;
	}
	
	//Summary: provide a central point of accepting and dealing with game action commands
	this.handleCommand = function (ip, command, data)
	{
		//console.log('Five Ten King received command');
		if (gameOver)
		{
			console.log('Not accepting commands anymore since game is over.');
			return false;
		}
		if (gamePaused)
		{
			console.log("Not accepting commands since game is paused.");
			messenger.sendToIP(ip, 'error-message', "The game is currently paused.");
			return false;
		}
		switch (command)
		{
			case 'ftkcmd-make-play':
				console.log('A play is to be made.');
				return handlePlay(ip, data);
				break;
			case 'ftkcmd-pass-turn':
				console.log('The player requests to pass.');
				return goNextTurn(ip);
				break;
			default:
				return false;
		}
	}
	
	function startCountdown (numSeconds)
	{
		if (!numSeconds)
		{
			numSeconds = 30000;
		}
		console.log("Countdown Started.");
		messenger.sendToIP(turnOwnerIP, 'ftk-start-countdown', numSeconds);
		turnSkipper = setTimeout(function () {
			if (!gameOver)
			{
				messenger.sendToIP(turnOwnerIP, 'error-message', "You have been idle for too long. Your turn will be skipped.");
				goNextTurn(turnOwnerIP, "force-pass");
			}
		}, numSeconds);
	}
	
	//Private functions
	//Summary: checks if the player at some ip actually has the cards that they try to play
	function hasCards (ip, cardsToPlay)
	{
		var playerHand = playerAtIP[ip].hand;
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
	
	//Summary: remove a list of cards from a player's hand after they have made a play with it
	function removeCards (ip, cardsToRemove)
	{
		var playerHand = playerAtIP[ip].hand;
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
	
	//Summary: handles the logic for handling end of turns
	//Notes: goNextTurn is called after a play was made, when a player passes, or when a player has been idle for too long on their turn
	function goNextTurn (ip, type)
	{
		if (!type)
		{
			type = 'passing';
		}
		console.log("goNextTurn called by " + util.getDisplay(playerAtIP[ip].player) + "; type: " + type);
		clearTimeout(turnSkipper);
		
		if (!(turnOwnerIP === ip))
		{
			messenger.sendToIP(ip, 'error-message', 'Cannot pass because it is not currently your turn to play.');
			return false;
		}
		if (type === 'passing' && lastPlayMaker === "")
		{
			messenger.sendToIP(ip, 'error-message', 'Cannot pass on your own turn if there is no play to pass on.');
			return false;
		}
		if (type === 'force-pass')
		{
			type = 'passing';
		}
		
		var allCardsPlayed = true;
		for (var i = 0; i < players.length; i ++)
		{
			if (!(players[i].hand.length === 0))
			{
				allCardsPlayed = false;
			}
		}
		if (allCardsPlayed)
		{
			console.log("No more cards left, game will end.");
			messenger.sendMessageToAll("The game is over! Use the Quit button to exit this lobby and the Ready button to find a new game.", "success");
			gameOver = true;
			return true;
		}
		else
		{
			console.log("Not all cards have been played, game will continue.");
		}
		
		var newTurnOwnerIP = playerAfterIP[ip].player.ip;
		console.log("next player ip: " + newTurnOwnerIP);
		if (!gameOver)
		{
			messenger.sendToIP(turnOwnerIP, 'ftk-end-countdown'); 
			var numTimesSkipped = 0;
			if (newTurnOwnerIP === lastPlayMaker) //wipe cards in play if new turn owner is playing on top of his last play
			{
				console.log("everyone passed on " + lastPlayMaker + "'s play, so now it's his turn again");
				lastPlayMaker = "";
				lastPlay = playChecker.getNoPlay();
				messenger.sendToAll('ftk-clear-display');
			}
			
			while (playerAtIP[newTurnOwnerIP].hand.length === 0) //if the new turn is for a player who has won, then their turn is skipped
			{
				console.log(util.getDisplay(playerAtIP[newTurnOwnerIP].player) + " has already finished playing their hand. So their turn will be skipped");
				newTurnOwnerIP = playerAfterIP[newTurnOwnerIP].player.ip;
				if (newTurnOwnerIP === lastPlayMaker) //wipe cards in play if new turn owner is playing on top of his last play
				{
					console.log("everyone passed on " + lastPlayMaker + "'s play, so now it's his turn again");
					lastPlayMaker = "";
					lastPlay = playChecker.getNoPlay();
					messenger.sendToAll('ftk-clear-display');
				}
				numTimesSkipped ++;
				if (numTimesSkipped > players.length) //this is to prevent infinite loops and to catch bugs related to the fact that playerAfterIP was not initialized correctly
				{
					console.log('THIS IS PROBABLY A BUG: all players have finished playing the but the game isnt yet over.');
					break;
				}
			}
			if (newTurnOwnerIP === turnOwnerIP) //this will log a warning if new turn owner is the same as current turn owner
			{
				console.log("warning: the player after the current player is the current player himself; not a bug if only 1 player is in game");
				lastPlayMaker = "";
				lastPlay = playChecker.getNoPlay();
				messenger.sendToAll('ftk-clear-display');
			}
			turnOwnerIP = newTurnOwnerIP;
			if (type === "passing")
			{
				messenger.sendMessageToAll(playerAtIP[ip].player.name + " has passed.", "normal");
			}
			
			messenger.sendMessageToAll("Now it's " + playerAtIP[newTurnOwnerIP].player.name + "'s turn.", "normal");
			messenger.sendNotificationToIP(newTurnOwnerIP, "Hey, it's your turn!");
			startCountdown(30000);
			return true;
		}
		else 
		{
			return false;
		}
	}
	
	//Summary: updates the players on the set of cards that were last played
	function alertPlay (cardsToPlay)
	{
		if (gameOver)
		{
			console.log("A play was sent, but the game is over.");
			return;
		}
		latestPlayCards = cardsToPlay;
		messenger.sendToAll('ftk-latest-play', cardsToPlay);
	}
	
	//Summary: updates the players on the number of cards that other players have
	function updateOthersToAll()
	{
		if (gameOver)
		{
			console.log("Blocking updates to the others cards field because game is over.");
			return;
		}
		console.log("Attempting to updates the others cards field for all players.");
		for (var i = 0; i < players.length; i ++)
		{
			var thisPlayer = players[i];
			var handCountsForThisPlayer = [];
			for (var j = 0; j < players.length; j ++)
			{
				if (!(players[j].player.ip === thisPlayer.player.ip))
				{
					handCountsForThisPlayer.push({name: players[j].player.name, numCards: players[j].hand.length});
				}
			}
			thisPlayer.socket.emit('ftk-update-others', handCountsForThisPlayer);
		}
	}

	//Summary: handles logic for when a player makes a move
	function handlePlay (ip, cardsToPlay)
	{
		if (!(turnOwnerIP === ip))
		{
			console.log(util.getDisplay(playerAtIP[ip].player) + " requested to play when it's not their turn. " + util.getDisplay(playerAtIP[turnOwnerIP].player) + " has the turn.");
			messenger.sendToIP(ip, "error-message", "It is not currently your turn to play.");
			return false;
		}
		//console.log('Incoming request is coming from the turn owner.');
		if (!(hasCards(ip, cardsToPlay)))
		{
			console.log('Turn owner\'s proposed play did not match with hand');
			messenger.sendToIP(ip, "error-message", "You are trying to make a play with cards you don't have!");
			return false;
		}
		//console.log('Turn owner\'s proposed play matched with hand.');

		var playResult = playChecker.calculatePlay(cardsToPlay);
		if (!(playChecker.isValidPlay(playResult)))
		{
			console.log("Play failed to evaluate.");
			return false;
		}
		if (!(playChecker.firstTrumpsSecond(playResult, lastPlay)))
		{
			console.log("New play did not trump old play.");
			return false;
		}
		console.log("new " + playResult.type.name + " play trumps old play");
		lastPlay = playResult;
		lastPlayMaker = ip;
		var numRemovedCards = removeCards(ip, cardsToPlay); //remove the played cards from player's hanad
		if (!(numRemovedCards === cardsToPlay.length))
		{
			console.log("an error occurred while removing cards from player's hand; " + numRemovedCards + " were removed but " + cardsToPlay.length + " cards were played");
			messenger.sendToIP(ip, "error-message", "An error occurred while processing your play.");
			return false;
		}
		console.log(util.getDisplay(playerAtIP[ip].player) + " just finished making the play.");
		messenger.sendMessageToAll(playerAtIP[ip].player.name + " just made a play. They now have " + playerAtIP[ip].hand.length + " cards left in their hand.", "warning");
		updateOthersToAll();
		if (playerAtIP[ip].hand.length <= 0)
		{
			console.log("They won the game.");
			messenger.sendMessageToAll(playerAtIP[ip].player.name + " has won! Congratulations.", "success");
			if (!hasFirstWinner)
			{
				console.log("This is the first winner of this match.");
				hasFirstWinner = true;
				if (metakey)
				{
					console.log("Preparing to send metapoints request.");
					var url = 'http://10.4.3.180:1338/integrations';
					var headers = {
						'metakey': metakey
					};
					var form = { "ip": ip, "reason": "winning a game" };
					httpRequest.post({ url: url, json: form, headers: headers }, 
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
		alertPlay(cardsToPlay);
		
		return goNextTurn(ip, 'finished-play');
	}
};

module.exports.FiveTenKing = FiveTenKing;

}());