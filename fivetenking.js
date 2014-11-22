(function () {
var FiveTenKing = function (playersList, deckCount, newMessenger, extraData) 
{
	//initializing components and utilities
	var FTKUtil = require("./common/FTKUtil.js");
	var util = new FTKUtil.FTKUtil();
	var FTKDealer = require("./components/FTKDealer.js");
	var FTKPlayChecker = require("./components/FTKPlayChecker.js");
	
	//privatize this one
	var playChecker = new FTKPlayChecker.FTKPlayChecker();  //
	if (playersList.length <= 0 || deckCount <= 0)
	{
		console.log("Error: initializing 50k with 0 or fewer players or decks" + playersList.length + " " + deckCount);
		return;
	}
	var playerAtIP = {};
	var playerAfterIP = {};
	var playersInRoom = "";
	for (var i = 0; i < playersList.length; i ++)
	{
		playersList[i].player.inqueue = false;
		playersList[i].player.ingame = true;
		playersList[i].hand = [];
		playersInRoom += playersList[i].player.name + ", ";
		
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
	var messenger = newMessenger;
	var httpRequest = extraData.httpRequestMaker; //
	var metakey = extraData.metakey; //
	var hasFirstWinner = false; //
	var players = playersList; //[{player: player, socket: socket, hand: [{card: 'd3', suit='d', value=0}]}]
	var lastPlay = playChecker.getNoPlay();
	var lastPlayMaker = "";
	var latestPlayCards = [];
	var gameOver = false;
	
	var dealer = new FTKDealer.FTKDealer(deckCount);
	var firstTurnOwner = dealer.dealCards(players);
	if (!firstTurnOwner)
	{
		console.log("ERROR: first turn owner not initialized.");
		return;
	}
	turnOwnerIP = firstTurnOwner;
	
	//********************************************************************************************************************
	this.endGame = function (ip) 
	{
		console.log("The player " + util.getDisplay(playerAtIP[ip]) + " has quit the game. If the game is already over, then nothing else will happen. Otherwise, this game is now over.");
		messenger.sendMessageToAll(playerAtIP[ip].player.name + " has quit the game. It is now safe to leave. Use the Quit button to exit this lobby and the Ready button to look for a new game.");
		gameOver = true;
	}
	
	this.alertMessageToAll = function (message, type)
	{
		messenger.sendMessageToAll(message, type);
	}
	
	this.recoverSession = function (ip, newSocket)
	{
		var recoveringPlayer = playerAtIP[ip];
		recoveringPlayer.socket = newSocket;
		console.log("Attempting to recover " + util.getDisplay(recoveringPlayer) + ".");
		var hand = playerAtIP[ip].hand;
		recoveringPlayer.socket.emit('ftk-recover-game-session');
		console.log('Hand length: ' + hand.length);
		for (var i = 0; i < hand.length; i ++)
		{
			console.log('Dealing card: ' + hand[i].card);
			recoveringPlayer.socket.emit('ftk-dealt-card', hand[i]);
		}
		recoveringPlayer.socket.emit('ftk-dealing-finished');
		
		recoveringPlayer.socket.emit('log-message', 'It is currently ' + playerAtIP[turnOwnerIP].player.name + '\'s turn.');
		if (lastPlayMaker)
		{
			console.log('Last play maker: ' + lastPlayMaker);
			var latestPlay = latestPlayCards;
			recoveringPlayer.socket.emit('ftk-latest-play', latestPlay);
			recoveringPlayer.socket.emit('log-message', 'The last play was made by ' + playerAtIP[lastPlayMaker].player.name + '.');
		}
		else
		{
			console.log('No plays on the field at the moment.');
			recoveringPlayer.socket.emit('ftk-clear-display');
		}
	}
	
	this.handleCommand = function (ip, command, data)
	{
		console.log('Five Ten King received command');
		if (gameOver)
		{
			console.log('Not accepting commands anymore since game is over.');
			return false;
		}
		switch (command)
		{
			case 'ftkcmd-make-play':
				console.log('ftkcmd-make-play has been called');
				return handlePlay(ip, data);
				break;
			case 'ftkcmd-pass-turn':
				console.log('ftkcmd-pass-turn has been called');
				return goNextTurn(ip);
				break;
			default:
				return false;
		}
	}
	//********************************************************************************************************************
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
	
	//********************************************************************************************************************
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
	
	//********************************************************************************************************************
	function goNextTurn (ip, type)
	{
		if (!type)
		{
			type = 'passing';
		}
		console.log("goNextTurn called by " + util.getDisplay(playerAtIP[ip]) + "; type: " + type);
		
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
			var numTimesSkipped = 0;
			if (newTurnOwnerIP === lastPlayMaker) //wipe cards in play if new turn owner is playing on top of his last play
			{
				console.log("everyone passed on " + lastPlayMaker + "'s play, so now it's his turn again");
				lastPlayMaker = "";
				lastPlay = playChecker.getNoPlay();//{type: this.playChecker.playTypes.NoPlay, strength: 0, length: 0};
				messenger.sendToAll('ftk-clear-display');
			}
			
			while (playerAtIP[newTurnOwnerIP].hand.length === 0) //if the new turn is for a player who has won, then their turn is skipped
			{
				console.log(util.getDisplay(playerAtIP[newTurnOwnerIP]) + " has already finished playing their hand. So their turn will be skipped");
				newTurnOwnerIP = playerAfterIP[newTurnOwnerIP].player.ip;
				if (newTurnOwnerIP === lastPlayMaker) //wipe cards in play if new turn owner is playing on top of his last play
				{
					console.log("everyone passed on " + lastPlayMaker + "'s play, so now it's his turn again");
					lastPlayMaker = "";
					lastPlay = playChecker.getNoPlay();//{type: playChecker.playTypes.NoPlay, strength: 0, length: 0};
					messenger.sendToAll('ftk-clear-display');
				}
				numTimesSkipped ++;
				if (numTimesSkipped > players.length)
				{
					console.log('THIS IS PROBABLY A BUG: all players have finished playing the but the game isnt yet over.');
					break;
				}
			}
			if (newTurnOwnerIP === turnOwnerIP) //this will log a warning if new turn owner is the same as current turn owner
			{
				console.log("warning: the player after the current player is the current player himself; not a bug if only 1 player is in game");
				lastPlayMaker = "";
				lastPlay = playChecker.getNoPlay();//{type: playChecker.playTypes.NoPlay, strength: 0, length: 0};
				messenger.sendToAll('ftk-clear-display');
			}
			turnOwnerIP = newTurnOwnerIP;
			if (type === 'passing')
			{
				messenger.sendMessageToAll(playerAtIP[ip].player.name + " has passed.", "normal");
			}
			
			messenger.sendMessageToAll("Now it's " + playerAtIP[newTurnOwnerIP].player.name + "'s turn.", "normal");
			messenger.sendNotificationToIP(newTurnOwnerIP, "Hey, it's your turn!");
			
			return true;
		}
		else 
		{
			return false;
		}
	}
	
	//********************************************************************************************************************
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
	
	//********************************************************************************************************************
	function updateOthersToAll ()
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

	//********************************************************************************************************************
	function handlePlay (ip, cardsToPlay)
	{
		if (!(turnOwnerIP === ip))
		{
			console.log(util.getDisplay(playerAtIP[ip]) + " requested to play when it's not their turn. " + util.getDisplay(playerAtIP[turnOwnerIP]) + " has the turn.");
			messenger.sendToIP(ip, "error-message", "It is not currently your turn to play.");
			return false;
		}
		console.log('Incoming request is coming from the turn owner.');
		if (!(hasCards(ip, cardsToPlay)))
		{
			console.log('Turn owner\'s proposed play did not match with hand');
			messenger.sendToIP(ip, "error-message", "You are trying to make a play with cards you don't have!");
			return false;
		}
		console.log('Turn owner\'s proposed play matched with hand.');

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
		console.log(util.getDisplay(playerAtIP[ip]) + " just finished making the play.");
		messenger.sendMessageToAll(playerAtIP[ip].player.name + " just made a play. They now have " + playerAtIP[ip].hand.length + " cards left in their hand.", "warning");
		updateOthersToAll();
		if (playerAtIP[ip].hand.length <= 0)
		{
			console.log("They won the game.");
			messenger.sendMessageToAll(playerAtIP[ip].player.name + " has won! Congratulations.", "success");
			if (!hasFirstWinner)
			{
				console.log("This is the first winner of this match. Preparing to send metapoints if integration exists.");
				hasFirstWinner = true;
				if (metakey)
				{
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