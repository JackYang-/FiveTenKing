(function () {
var FiveTenKing = function (playersList, deckCount, extraData) 
{
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
	this.notifyUntilMoveOrPass(this.turnOwnerIP);
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
		this.notifyUntilMoveOrPass(newTurnOwnerIP);
		
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
	for (var i = 0; i < this.players.length; i ++)
	{
		this.players[i].socket.emit('ftk-clear-display');
	}
}
FiveTenKing.prototype.alertMessageToAll = function (message, type)
{
	if (this.gameOver)
	{
		console.log("The alert message [" + message + "] has been blocked because the game is now over.");
		return;
	}
	var socketMsg = 'log-message';
	if (!type)
	{
		return;
	}
	else if (type === "normal")
	{
		socketMsg = 'log-message';
	}
	else if (type === "warning")
	{
		socketMsg = 'warning-message';
	}
	else if (type === "error")
	{
		socketMsg = 'error-message';
	}
	else if (type === "success")
	{
		socketMsg = 'success-message';
	}
	if (message)
	{
		for (var i = 0; i < this.players.length; i ++)
		{
			if (this.players[i].player.ingame)
			{
				this.players[i].socket.emit(socketMsg, message);
			}
		}
	}
}
FiveTenKing.prototype.alertPlayToAll = function (cardsToPlay)
{
	if (this.gameOver)
	{
		console.log("A play was sent, but the game is over.");
		return;
	}
	this.latestPlayCards = cardsToPlay;
	for (var i = 0; i < this.players.length; i ++)
	{
		this.players[i].socket.emit('ftk-latest-play', cardsToPlay);
	}
}
FiveTenKing.prototype.notifyUntilMoveOrPass = function (ip)
{
	if (this.gameOver)
	{
		console.log("Trying to nofity someone until move or pass, but the game is over.");
		return;
	}
	var $this = this;
	//var playerToNotify = this.playerAtIP[ip];
	this.turnOwnerNotifier = setTimeout(function () {
		if ($this.gameOver)
		{
			return;
		}
		console.log("Reminding " + $this.playerAtIP[ip].player.name + "(" + ip + ") to make a move.");
		$this.sendDesktopNotification(ip, 'You might want to make a move soon, or your turn will be skipped!');
		$this.turnOwnerNotificationCount ++;
		if ($this.turnOwnerNotificationCount >= 3)
		{
			console.log($this.playerAtIP[ip].player.name + "(" + ip + ") has been idle for too long; their turn will be skipped.");
			$this.goNextTurn(ip, 'passing');
			return;
		}
		else
		{
			$this.notifyUntilMoveOrPass(ip);
		}
	}, 10000);
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
	if (message)
	{
		this.playerAtIP[ip].socket.emit('desktop-notification', message);
	}
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
/*FiveTenKing.prototype.calculatePlay = function (cardsToPlay)//returns an object of the form {type: int, strength: int, length: int}
{
	if (cardsToPlay.length === 1) //checking for singles
	{
		return {type: this.playTypes.Single, strength: cardsToPlay[0].value, length: 0};
	}
	if (cardsToPlay.length === 2) //checking for doubles; ensure both cards have the same value for a valid double
	{
		if (cardsToPlay[0].value === cardsToPlay[1].value)
		{
			return {type: this.playTypes.DoubleStraight, strength: cardsToPlay[0].value, length: 1};
		}
		else
		{
			return {type: this.playTypes.Unknown, strength: 0, length: 0};
		}
	}
	if (cardsToPlay.length === 3) //checking for five ten king only
	{
		var five = false;
		var ten = false;
		var king = false;
		var sameSuit = true;
		var firstSuit = cardsToPlay[0].suit;
		for (var i = 0; i < cardsToPlay.length; i ++)
		{
			var cardValue = cardsToPlay[i].value;
			if (cardValue === this.deckAssembleMapping.indexOf("5"))
			{
				five = true;
			}
			if (cardValue === this.deckAssembleMapping.indexOf("10"))
			{
				ten = true;
			}
			if (cardValue === this.deckAssembleMapping.indexOf("k"))
			{
				king = true;
			}
			if (!(cardsToPlay[i].suit === firstSuit))
			{
				sameSuit = false;
			}
		}
		if (five && ten && king)
		{
			if (sameSuit)
			{
				return {type: this.playTypes.FiveTenKingSameSuit, strength: 0, length :0};
			}
			else
			{
				return {type: this.playTypes.FiveTenKing, strength: 0, length: 0};
			}
		}
	}
	if (cardsToPlay.length === 4) //checking for quads only
	{
		var firstValue = cardsToPlay[0].value;
		var isQuad = true;
		for (var i = 0; i < cardsToPlay.length; i ++)
		{
			if (!(cardsToPlay[i].value === firstValue))
			{
				isQuad = false;
			}
		}
		if (isQuad)
		{
			return {type: this.playTypes.Quad, strength: firstValue, length: 0}; 
		}
	}
	
	//this part gets evaluated if the played is not simple and requires more complex evaluation
	var cardMap = []; //cardMap's index is the value of the cards (0 is 3, 1 is 4, 14 is big joker) and the element at the index is how many cards are there of that value
	for (var i = 0; i < 15; i ++)
	{
		cardMap[i] = 0;
	}
	for (var i = 0; i < cardsToPlay.length; i ++)
	{
		cardMap[cardsToPlay[i].value] ++;
	}
	// for (var i = 0; i < cardMap.length ; i ++)
	// {
		// console.log("map index: " + i + " | count: " + cardMap[i]);
	// }
	var complexResult = this.calculateComplexPlay(cardMap, true); //this returns more than you will need, so we only extract the pieces we need
	
	return {type: complexResult.type, strength: complexResult.strength, length: complexResult.length};
	
}
//This function is reached when the play is not a single, not a double, not a five ten king and not a quad
FiveTenKing.prototype.calculateComplexPlay = function (cardMap, checkTwosAndJokers)
{
	var returnObject = {type: this.playTypes.Unknown, strength: 0, length: 0};
	
	var stragglers = 0; //stragglers are cards that can't fit into any combo so they must be a part of a triple or a triple straight
						//if there are more straggler's than there are 2 times the total number of playable consecutive triples, then we return an Unknown play
	var numCards = 0; //this holds the total number of cards that have been evaluated so far
					 //important because we start evaluating from the end to the front of the map, if the front of the map contains a large triple straight then it's possible for all the cards near the end to be stragglers
	var consecutiveTriplesInScope = 0; //this holds the number of triples seen in the scope so far
	var possiblePlays = [];
	
	//this section is a list of commonly used helpers
	var wipeMapFromIndex = function(map, start)
	{
		for (var i = start; i < map.length; i ++)
		{
			map[i] = 0;
		}
	}
	var isSameType = function (type1, type2)
	{
		return type1.name === type2.name;
	}
	//end of helper functions
	
	if (checkTwosAndJokers) //only evaluates to true on the first call
	{
		stragglers += cardMap[14] + cardMap[13];//cardMap[14] is the number of big jokers, cardMap[13] is the number of small jokers
												//jokers are special because they cannot be combo'd at all
		numCards += stragglers;
		var numTwos = cardMap[12]; //cardMap[12] is the number of 2's. 2's cannot be a part of a straight but they can be used as standalone triples
		numCards += numTwos;
		if (numTwos <= 5 && numTwos >= 3)
		{
			stragglers += numTwos - 3; //3-5 two's can imply that a triple 2 wants to be played
			consecutiveTriplesInScope = 1;
		}
		else
		{
			stragglers += numTwos; //1 or 2 or 6+ two's imply that they are stragglers since it's impossible to play them as standalones
		}
		
		cardMap[14] = 0;
		cardMap[13] = 0;
		cardMap[12] = 0;
		possiblePlays = this.calculateComplexPlay(cardMap, false); //by recursion, find all the possible valid plays with the rest of the elements in the cardMap
		if (possiblePlays.length === 0 && consecutiveTriplesInScope > 0 && consecutiveTriplesInScope * 2 >= stragglers) //this should be true when there are no cards other than 2's and jokers in the play
		{																				//and when there's a triple 2 in play
			//console.log("triple 2 detected");
			returnObject.type = this.playTypes.TripleStraight;
			returnObject.strength = 12;
			returnObject.length = 1;
			return returnObject;
		}
		else if (possiblePlays.length > 0)
		{
			//console.log("there are valid possible plays");
			for (var i = 0; i < possiblePlays.length; i ++)
			{
				//console.log(possiblePlays[i].type.name);
				if (isSameType(possiblePlays[i].type, this.playTypes.SingleStraight) && numCards === 0) //using numCards instead of stragglers because triple 2's cannot be played together with straights
				{
					console.log("evaluation complete: single straight");
					return possiblePlays[i];
				}
				else if (isSameType(possiblePlays[i].type, this.playTypes.DoubleStraight) && numCards === 0)
				{
					console.log("evaluation complete: double straight");
					return possiblePlays[i];
				}
				else if (isSameType(possiblePlays[i].type, this.playTypes.TripleStraight))
				{
					if (possiblePlays[i].numTriples * 2 >= possiblePlays[i].numStragglers + numCards)
					{
						console.log("evaluation complete: triple straight");
						return possiblePlays[i];
					}
				}
				else if (isSameType(possiblePlays[i].type, this.playTypes.Unknown) && possiblePlays[i].numStragglers > 0)
				{
					if (consecutiveTriplesInScope * 2 >= (possiblePlays[i].numStragglers))
					{
						console.log("evaluation complete: triple straight of two's");
						return {type: this.playTypes.TripleStraight, strength: 12, length: 1};
					}
				}
			}
		}
		return returnObject;
	}
	else //every recursive call should come here
	{
		var initialSearchPoint;
		var breakingPoint;
		for (var i = 11; i >= 0; i --)
		{
			breakingPoint = i;
			initialSearchPoint = i;
			//console.log("Trace: " + i);
			if (cardMap[i] >= 3) //we found a triple or above
			{
				var cardCount = cardMap[i];
				//console.log("Found", cardCount, "cards");
				numCards += cardCount;
				if (i >= 0)
				{
					//console.log("initiating search for longest triple straight from here");
					var triTracerStart = i;
					var triTracerIndex = i;
					var triLength = 0;
					while (triTracerIndex >= 0 && cardMap[triTracerIndex] >= 3)
					{
						stragglers += cardMap[triTracerIndex] - 3;
						//console.log("looking for triple straight:", (triLength + 1), "th triple found.");
						//console.log("current number of stragglers: " + stragglers);
						triLength ++;
						triTracerIndex --;
					}
					if (triTracerIndex === -1)
					{
						//console.log("triple straight inner trace went to bottom; checking straggler count to see if play is valid");
						//console.log("number of triples: " + triLength);
						//console.log("number of stragglers: " + stragglers);
						if (triLength * 2 >= stragglers)
						{
							//console.log("straggler count is below the maximum, this play is viable");
							possiblePlays.push({type: this.playTypes.TripleStraight, strength: triTracerStart, length: triLength, numTriples: triLength, numStragglers: stragglers});
							return possiblePlays;
						}
						else
						{
							//console.log("too many stragglers, play is not viable");
							stragglers += triLength * 3;
							breakingPoint = triTracerIndex + 1;
							break;
						}
					}
					else if (cardMap[triTracerIndex] <= 2)
					{
						//console.log("triple straight search ended because we stumbled upon a non-triple (0, 1 or 2 cards)");
						//console.log("will attempt to check if there are sufficient leftover cards to make a play with the current triple straight");
						
						var numCardsToTheLeft = 0;
						for (var j = triTracerIndex; j >= 0; j --)
						{
							numCardsToTheLeft += cardMap[j];
						}
						//console.log(numCardsToTheLeft + " cards are found to the left of this triple play");
						//console.log("there are also " + stragglers + " stragglers");
						if ((triLength * 2) >= (stragglers + numCardsToTheLeft))
						{
							//console.log("There are enough triples to hold the total number of stragglers. Valid play.");
							possiblePlays.push({type: this.playTypes.TripleStraight, strength: triTracerStart, length: triLength, numTriples: triLength, numStragglers: stragglers});
							return possiblePlays;
						}
						else
						{
							//console.log("There are not enough triples to hold the stragglers. Play is not viable: every card becomes straggler");
							stragglers += triLength * 3;
							breakingPoint = triTracerIndex + 1;
							break;
						}
						
					}
				}
			}
			else if (cardMap[i] === 2) //we found a double
			{
				//console.log("Found a double");
				numCards += 2;
				if (i >= 1 && stragglers === 0)
				{
					//console.log("potential for double straight");
					var dsTracerStart = i;
					var dsTracerIndex = i;
					var dsLength = 0;
					while (dsTracerIndex >= 0 && cardMap[dsTracerIndex] === 2)
					{
						//console.log("looking for double straight: " + (dsLength + 1) + "th double found.");
						dsLength ++;
						dsTracerIndex --;
					}
					if (dsTracerIndex === -1)
					{
						//console.log("double straight inner trace went to bottom");
						possiblePlays.push({type: this.playTypes.DoubleStraight, strength: dsTracerStart, length: dsLength, numTriples: 0, numStragglers: 0});
						return possiblePlays;
					}
					else if (cardMap[dsTracerIndex] === 0 && dsLength >= 2)
					{
						//console.log("empty block hit while checking for double straights");
						var numCardsToTheLeft = 0;
						for (var j = dsTracerIndex; j >= 0; j --)
						{
							numCardsToTheLeft += cardMap[j];
						}
						if (numCardsToTheLeft > 0)
						{
							//console.log("found cards to the left, no double straight");
							stragglers += dsLength * 2;
							breakingPoint = dsTracerIndex + 1;
							break;
						}
						else
						{
							//console.log("no cards on the left, double straight found");
							possiblePlays.push({type: this.playTypes.DoubleStraight, strength: dsTracerStart, length: dsLength, numTriples: 0, numStragglers: 0});
							return possiblePlays;
						}
					}
					else if (cardMap[dsTracerIndex] >= 3) //we've seen a triple, there's hope! 
					{
						//console.log("double straight not possible but a triple has been spotted");
						stragglers += dsLength * 2;
						wipeMapFromIndex(cardMap, dsTracerIndex + 1);
						var potentialPlaysFromRest = this.calculateComplexPlay(cardMap, false);
						for (var k = potentialPlaysFromRest.length - 1; k >= 0; k --)
						{
							if (!isSameType(potentialPlaysFromRest[k].type, this.playTypes.TripleStraight))
							{
								potentialPlaysFromRest.splice(k, 1);
							}
							else
							{
								potentialPlaysFromRest[k].numStragglers += stragglers;
								if (potentialPlaysFromRest[k].numTriples * 2 < potentialPlaysFromRest[k].numStragglers)
								{
									potentialPlaysFromRest.splice(k, 1);
								}
							}
						}
						return potentialPlaysFromRest;
					}
					else
					{
						//console.log("bumped into a non 2, or the straight is not long enough");
						stragglers += dsLength * 2;
						breakingPoint = dsTracerIndex + 1;
						break;
					}
				}
			}
			else if (cardMap[i] === 1) //we found a single
			{
				//console.log("Found a single");
				numCards ++;
				if (i >= 4 && stragglers === 0) //there is potential for a single straight, loop down from this point until we find a non-single to find a straight
				{
					//console.log("potential for single straight");
					var straightTracerStart = i;
					var straightTracerIndex = i;
					var straightLength = 0;
					while (straightTracerIndex >= 0 && cardMap[straightTracerIndex] === 1) //keep tracing through straight until we hit bottom of map or the straight is broken
					{
						straightLength ++;
						straightTracerIndex --;
					}
					if (straightTracerIndex === -1) //tracer went to bottom; must be a straight
					{
						//console.log("inner tracer went to bottom");
						possiblePlays.push({type: this.playTypes.SingleStraight, strength: straightTracerStart, length: straightLength, numTriples: 0, numStragglers: 0});
						return possiblePlays;
					}
					else if (cardMap[straightTracerIndex] === 0 && straightLength >= 5) //we've hit an empty block, so there's still a possibility that we've found a straight and there are no more cards on the left
					{
						//console.log("empty block, maybe there is a straight");
						var numCardsToTheLeft = 0;
						for (var j = straightTracerIndex; j >= 0; j --)
						{
							numCardsToTheLeft += cardMap[j]; 
						}
						if (numCardsToTheLeft > 0) //there are cards to the left, so our straight cannot be played; all the cards found are stragglers
						{
							//console.log("there are cards to the left, so no straight");
							stragglers += straightLength;
							breakingPoint = straightTracerIndex + 1;
							break;
						}
						else //there are no cards to the left, we've found a straight!
						{
							//console.log("no cards to the left, found straight!");
							possiblePlays.push({type: this.playTypes.SingleStraight, strength: straightTracerStart, length: straightLength, numTriples: 0, numStragglers: 0});
							return possiblePlays;
						}
					}
					else if (cardMap[straightTracerIndex] >= 3) //we've seen a triple, there's hope! 
					{
						//console.log("straight not possible but a triple has been spotted");
						stragglers += straightLength;
						wipeMapFromIndex(cardMap, straightTracerIndex + 1);
						var potentialPlaysFromRest = this.calculateComplexPlay(cardMap, false);
						for (var k = potentialPlaysFromRest.length - 1; k >= 0; k --)
						{
							if (!isSameType(potentialPlaysFromRest[k].type, this.playTypes.TripleStraight))
							{
								potentialPlaysFromRest.splice(k, 1);
							}
							else
							{
								potentialPlaysFromRest[k].numStragglers += stragglers;
								if (potentialPlaysFromRest[k].numTriples * 2 < potentialPlaysFromRest[k].numStragglers)
								{
									potentialPlaysFromRest.splice(k, 1);
								}
							}
						}
						return potentialPlaysFromRest;
					}
					else //either we've bumped into a double, or the straights not long enough
					{
						//console.log("either we've bumped into a double, or the straights not long enough");
						stragglers += straightLength; //cardMap[straightTracerIndex];
						breakingPoint = straightTracerIndex + 1;
						break;
					}
					
				}
				else //not enough numbers to form a single straight, so all the numbers from here on out must be stragglers
				{
					//console.log("not enough numbers to form a single straight, so all the numbers from here on out must be stragglers");
					stragglers ++;
				}
			}
		}
		
		wipeMapFromIndex(cardMap, breakingPoint);
		
		if (breakingPoint > 0)
		{
			//console.log("breaking point is nonzero");
			possiblePlays = this.calculateComplexPlay(cardMap, false);
			if (stragglers > 0)
			{
				//console.log("there are stragglers (nonzero breakpoint)");
				for (var i = possiblePlays.length - 1; i >= 0; i --) //iterate backwards to not displace elements when splicing
				{
					if (!isSameType(possiblePlays[i].type, this.playTypes.TripleStraight))
					{
						possiblePlays.splice(i, 1);
					}
					else
					{
						possiblePlays[i].numStragglers += stragglers;
						if (possiblePlays[i].numTriples * 2 < possiblePlays[i].numStragglers)
						{
							possiblePlays.splice(i, 1);
						}
					}
				}
				return possiblePlays;
			}
			else
			{
				//console.log("there are no stragglers (nonzero breakpoint)");
				return possiblePlays;
			}
		}
		else
		{
			//console.log("breaking point is zero");
			if (stragglers > 0)
			{
				//console.log("there are stragglers (zero breakpoint)");
				possiblePlays.push({type: this.playTypes.Unknown, strength: 0, length: 0, numTriples: consecutiveTriplesInScope, numStragglers: stragglers});
				return possiblePlays;
			}
			else
			{
				//console.log("there are no stragglers (nonzero breakpoint)");
				return possiblePlays;
			}
		}
	}
}*/
module.exports.FiveTenKing = FiveTenKing;

}());