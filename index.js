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
var _numDecksForFTK = settings.numDecksInSingletonFTK ? settings.numDecksInSingletonFTK : 2;
var _FTKQueueCap = settings.queueCap ? settings.queueCap : 1;

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
var playerGameMap = {};
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
	this.indexAtIP = {}; //{ "ip": index of players array which contains the player }
	for (var i = 0; i < this.players.length; i ++)
	{
		this.indexAtIP[this.players[i].player.ip] = i;
	}
	this.deckAssembleMapping = ["3", "4", "5", "6", "7", "8", "9", "10", "j", "q", "k", "1", "2"];
	this.suitMapping = ["d", "s", "h", "c"];
	this.dealersCards = []; //[{card: 'd3', value=0}]
	this.playTypes = {
		NoPlay: {name: "No Play", overrideFactor: 0},
		Unknown: {name: "Unknown Play", overrideFactor: 0},
		Single: {name: "Single", overrideFactor: 1},
		SingleStraight: {name: "Single Straight", overrideFactor: 1},
		DoubleStraight: {name: "Double Straight", overrideFactor: 1},
		TripleStraight: {name: "Triple Straight", overrideFactor: 1},
		FiveTenKing: {name: "Five Ten King", overrideFactor: 2},
		FiveTenKingSameSuit: {name: "Same Suit Five Ten King", overrideFactor: 3},
		Quad: {name: "Quad", overrideFactor: 4}
	}
	this.turnOwnerIP = "";
	this.lastPlay = {type: this.playTypes.NoPlay, strength: 0, length: 0};
	//playType is the 'type' of the new play (self explanatory)
	//a play with a higher overrideFactor automatically trumps a play with lower overrideFactor (ie: five ten king will have a higher override factor than a triple)
		//Single, Double, Triple and all straights have overrideFactor 1
		//vanila five ten kings have overrideFactor 2
		//five ten kings with all 3 cards of the same suit has overrideFactor 3
		//quads have overrideFactor 4
	//if a play is made with the same overrideFactor as the lastPlay, then:
		//if lastPlay's length is non-zero, it means lastPlay is some type of straight; newPlay's length must match the lastPlay's length
		//newPlay's type.name must match lastPlay's type.name
		//in all cases, newPlay's strength must be strictly greater than lastPlay's strength to trump it
	
	for (var i = 0; i < deckCount; i ++)
	{
		this.assembleDeck();
	}
	
	this.shuffleDeck();
	this.dealCards();
};
FiveTenKing.prototype.handlePlay = function (ip, cardsToPlay)
{
	var playResult = this.calculatePlay(cardsToPlay);
	var trump = false;
	if (!(playResult.type.name === this.playTypes.Unknown.name || playResult.type.name === this.playTypes.NoPlay.name))
	{
		if (playResult.type.overrideFactor > this.lastPlay.type.overrideFactor || //overrideFactor is greater OR:
				(playResult.type.overrideFactor === this.lastPlay.type.overrideFactor //same override factor
					&& playResult.type.name === this.lastPlay.type.name //same type
					&& playResult.strength > this.lastPlay.strength //greater strength
					&& playResult.length === this.lastPlay.length)) //same length
		{
			console.log("new " + playResult.type.name + " play trumps old play");
			this.lastPlay = playResult;
			return true;
		}
		else
		{
			console.log("new " + playResult.type.name + " play did not trump old play");
			return false;
		}
	}
	else
	{
		console.log("play failed to evaluate; type played: " + playResult.type.name);
		return false;
	}
}

FiveTenKing.prototype.calculatePlay = function (cardsToPlay)//returns an object of the form {type: int, strength: int, length: int}
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
	for (var i = 0; i < cardMap.length ; i ++)
	{
		console.log("map index: " + i + " | count: " + cardMap[i]);
	}
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
			console.log("triple 2 detected");
			returnObject.type = this.playTypes.TripleStraight;
			returnObject.strength = 12;
			return returnObject;
		}
		else if (possiblePlays.length > 0)
		{
			console.log("there are valid possible plays");
			for (var i = 0; i < possiblePlays.length; i ++)
			{
				console.log(possiblePlays[i].type.name);
				if (possiblePlays[i].type.name === this.playTypes.SingleStraight.name && numCards === 0) //using numCards instead of stragglers because triple 2's cannot be played together with straights
				{
					console.log("evaluation complete: single straight");
					return possiblePlays[i];
				}
				else if (possiblePlays[i].type.name === this.playTypes.DoubleStraight.name && numCards === 0)
				{
					console.log("evaluation complete: double straight");
					return possiblePlays[i];
				}
				else if (possiblePlays[i].type.name === this.playTypes.TripleStraight.name)
				{
					if (possiblePlays[i].numTriples * 2 >= possiblePlays[i].numStragglers + numCards)
					{
						console.log("evaluation complete: triple straight");
						return possiblePlays[i];
					}
				}
				else if (possiblePlays[i].type.name === this.playTypes.Unknown.name && possiblePlays[i].numStragglers > 0)
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
			console.log("Trace: " + i);
			if (cardMap[i] >= 3) //we found a triple or above
			{
				var cardCount = cardMap[i];
				console.log("Found", cardCount, "cards");
				numCards += cardCount;
				if (i >= 0)
				{
					console.log("initiating search for longest triple straight from here");
					var triTracerStart = i;
					var triTracerIndex = i;
					var triLength = 0;
					while (triTracerIndex >= 0 && cardMap[triTracerIndex] >= 3)
					{
						stragglers += cardMap[triTracerIndex] - 3;
						console.log("looking for triple straight:", (triLength + 1), "th triple found.");
						console.log("current number of stragglers: " + stragglers);
						triLength ++;
						triTracerIndex --;
					}
					if (triTracerIndex === -1)
					{
						console.log("triple straight inner trace went to bottom; checking straggler count to see if play is valid");
						console.log("number of triples: " + triLength);
						console.log("number of stragglers: " + stragglers);
						if (triLength * 2 >= stragglers)
						{
							console.log("straggler count is below the maximum, this play is viable");
							possiblePlays.push({type: this.playTypes.TripleStraight, strength: triTracerStart, length: triLength, numTriples: triLength, numStragglers: stragglers});
							return possiblePlays;
						}
						else
						{
							console.log("too many stragglers, play is not viable");
							stragglers += triLength * 3;
							breakingPoint = triTracerIndex + 1;
							break;
						}
					}
					else if (cardMap[triTracerIndex] <= 2)
					{
						console.log("triple straight search ended because we stumbled upon a non-triple (0, 1 or 2 cards)");
						console.log("will attempt to check if there are sufficient leftover cards to make a play with the current triple straight");
						
						var numCardsToTheLeft = 0;
						for (var j = triTracerIndex; j >= 0; j --)
						{
							numCardsToTheLeft += cardMap[j];
						}
						console.log(numCardsToTheLeft + " cards are found to the left of this triple play");
						console.log("there are also " + stragglers + " stragglers");
						if ((triLength * 2) >= (stragglers + numCardsToTheLeft))
						{
							console.log("There are enough triples to hold the total number of stragglers. Valid play.");
							possiblePlays.push({type: this.playTypes.TripleStraight, strength: triTracerStart, length: triLength, numTriples: triLength, numStragglers: stragglers});
							return possiblePlays;
						}
						else
						{
							console.log("There are not enough triples to hold the stragglers. Play is not viable: every card becomes straggler");
							stragglers += triLength * 3;
							breakingPoint = triTracerIndex + 1;
							break;
						}
						
					}
				}
			}
			else if (cardMap[i] === 2) //we found a double
			{
				console.log("Found a double");
				numCards += 2;
				if (i >= 1 && stragglers === 0)
				{
					console.log("potential for double straight");
					var dsTracerStart = i;
					var dsTracerIndex = i;
					var dsLength = 0;
					while (dsTracerIndex >= 0 && cardMap[dsTracerIndex] === 2)
					{
						console.log("looking for double straight: " + (dsLength + 1) + "th double found.");
						dsLength ++;
						dsTracerIndex --;
					}
					if (dsTracerIndex === -1)
					{
						console.log("double straight inner trace went to bottom");
						possiblePlays.push({type: this.playTypes.DoubleStraight, strength: dsTracerStart, length: dsLength, numTriples: 0, numStragglers: 0});
						return possiblePlays;
					}
					else if (cardMap[dsTracerIndex] === 0 && dsLength >= 2)
					{
						console.log("empty block hit while checking for double straights");
						var numCardsToTheLeft = 0;
						for (var j = dsTracerIndex; j >= 0; j --)
						{
							numCardsToTheLeft += cardMap[j];
						}
						if (numCardsToTheLeft > 0)
						{
							console.log("found cards to the left, no double straight");
							stragglers += dsLength * 2;
							breakingPoint = dsTracerIndex + 1;
							break;
						}
						else
						{
							console.log("no cards on the left, double straight found");
							possiblePlays.push({type: this.playTypes.DoubleStraight, strength: dsTracerStart, length: dsLength, numTriples: 0, numStragglers: 0});
							return possiblePlays;
						}
					}
					else if (cardMap[dsTracerIndex] >= 3) //we've seen a triple, there's hope! 
					{
						console.log("double straight not possible but a triple has been spotted");
						stragglers += dsLength * 2;
						for (var l = dsTracerIndex + 1; l < cardMap.length; l ++)
						{
							cardMap[l] = 0;
						}
						var potentialPlaysFromRest = this.calculateComplexPlay(cardMap, false);
						for (var k = potentialPlaysFromRest.length - 1; k >= 0; k --)
						{
							if (!(potentialPlaysFromRest[k].type.name === this.playTypes.TripleStraight.name))
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
						console.log("bumped into a non 2, or the straight is not long enough");
						stragglers += dsLength * 2; //cardMap[straightTracerIndex];
						breakingPoint = straightTracerIndex + 1;
						break;
					}
				}
			}
			else if (cardMap[i] === 1) //we found a single
			{
				console.log("Found a single");
				numCards ++;
				if (i >= 4 && stragglers === 0) //there is potential for a single straight, loop down from this point until we find a non-single to find a straight
				{
					console.log("potential for single straight");
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
						console.log("inner tracer went to bottom");
						possiblePlays.push({type: this.playTypes.SingleStraight, strength: straightTracerStart, length: straightLength, numTriples: 0, numStragglers: 0});
						return possiblePlays;
					}
					else if (cardMap[straightTracerIndex] === 0 && straightLength >= 5) //we've hit an empty block, so there's still a possibility that we've found a straight and there are no more cards on the left
					{
						console.log("empty block, maybe there is a straight");
						var numCardsToTheLeft = 0;
						for (var j = straightTracerIndex; j >= 0; j --)
						{
							numCardsToTheLeft += cardMap[j]; 
						}
						if (numCardsToTheLeft > 0) //there are cards to the left, so our straight cannot be played; all the cards found are stragglers
						{
							console.log("there are cards to the left, so no straight");
							stragglers += straightLength;
							breakingPoint = straightTracerIndex + 1;
							break;
						}
						else //there are no cards to the left, we've found a straight!
						{
							console.log("no cards to the left, found straight!");
							possiblePlays.push({type: this.playTypes.SingleStraight, strength: straightTracerStart, length: straightLength, numTriples: 0, numStragglers: 0});
							return possiblePlays;
						}
					}
					else if (cardMap[straightTracerIndex] >= 3) //we've seen a triple, there's hope! 
					{
						console.log("straight not possible but a triple has been spotted");
						stragglers += straightLength;
						for (var l = straightTracerIndex + 1; l < cardMap.length; l ++)
						{
							cardMap[l] = 0;
						}
						var potentialPlaysFromRest = this.calculateComplexPlay(cardMap, false);
						for (var k = potentialPlaysFromRest.length - 1; k >= 0; k --)
						{
							if (!(potentialPlaysFromRest[k].type.name === this.playTypes.TripleStraight.name))
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
						console.log("either we've bumped into a double, or the straights not long enough");
						stragglers += straightLength; //cardMap[straightTracerIndex];
						breakingPoint = straightTracerIndex + 1;
						break;
					}
					
				}
				else //not enough numbers to form a single straight, so all the numbers from here on out must be stragglers
				{
					console.log("not enough numbers to form a single straight, so all the numbers from here on out must be stragglers");
					stragglers ++;
				}
			}
		}
		
		for (var i = breakingPoint; i < cardMap.length; i ++) //remove cards that have been processed from the cardmap
		{
			cardMap[breakingPoint] = 0;
		}
		
		if (breakingPoint > 0)
		{
			console.log("breaking point is nonzero");
			possiblePlays = this.calculateComplexPlay(cardMap, false);
			if (stragglers > 0)
			{
				console.log("there are stragglers (nonzero breakpoint)");
				for (var i = possiblePlays.length - 1; i >= 0; i --) //iterate backwards to not displace elements when splicing
				{
					if (!(possiblePlays[i].type.name === this.playTypes.TripleStraight.name))
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
				console.log("there are no stragglers (nonzero breakpoint)");
				return possiblePlays;
			}
		}
		else
		{
			console.log("breaking point is zero");
			if (stragglers > 0)
			{
				console.log("there are stragglers (zero breakpoint)");
				possiblePlays.push({type: this.playTypes.Unknown, strength: 0, length: 0, numTriples: consecutiveTriplesInScope, numStragglers: stragglers});
				return possiblePlays;
			}
			else
			{
				console.log("there are no stragglers (nonzero breakpoint)");
				return possiblePlays;
			}
		}
	}	
}
//TODO: data sanity checks and send a token to the client to prevent it from sending bad requests
FiveTenKing.prototype.handleCommand = function (ip, command, data)
{
	console.log('Five Ten King received command');
	switch (command)
	{
		case 'ftkcmd-make-play':
			console.log('ftkcmd-make-play has been called');
			return this.handlePlay(ip, data);
			break;
		default:
			return false;
	}
}
FiveTenKing.prototype.dealCards = function ()
{
	var playerCounterMax = this.players.length - 1;
	var playerCounter = 0;
	
	while (this.dealersCards.length > 0)
	{
		var card = this.getNextCard();
		this.players[playerCounter].hand.push(card);
		if (card.card === 'd3' && !this.turnOwnerIP)
		{
			console.log('The first 3 of diamonds was dealt to ' + this.players[playerCounter].player.name + '(' + this.players[playerCounter].player.ip + ')');
			this.turnOwnerIP = this.players[playerCounter].player.ip;
			var firstTurnPlayerName = this.players[playerCounter].player.name;
			for (var j = 0; j < this.players.length; j ++)
			{
				this.players[j].playerSocket.emit('log-message', firstTurnPlayerName + ' has snatched the first turn by drawing the first 3 of diamonds.');
			}
		}
		//console.log('Player ' + playerCounter + ' was dealt: ' + card.card);
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
			this.dealersCards.push({card: this.suitMapping[k] + this.deckAssembleMapping[j], suit: this.suitMapping[k], value: j});
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
		socket.emit('log-message', 'Hi there! To get started, give yourself a new name by editing your profile information in the top right dropdown. If this is your first time, please refer to the rule book (coming soon TM) in the top bar.');
	}
	
	socket.on('ftk-move', function (command, data, callback) {
		console.log('Five Ten King command initiated from ' + playerSearchResult.name + '(' + playerIP + ').');
		var result = playerGameMap[playerIP].handleCommand(playerIP, command, data);
		if (!(result === true || result === false))
		{
			result = false;
		}
		callback(result);
	});
	
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
		
		if (playerQueue.length >= _FTKQueueCap) //change to appropriate number
		{
			var playerList = [];
			for (var i = 0; i < playerQueue.length; i ++) //message player for game found; assemble players for new game instance
			{
				playerQueue[i].playerSocket.emit('log-message', 'Match found!');
				playerList.push(playerQueue[i]);
			}
			var newGameInstance = new FiveTenKing(playerList, _numDecksForFTK); //edit deck count
			gamesInProgress.push(newGameInstance);
			for (var i = 0; i < playerList.length; i ++) //need to keep track of the games that the players are in
			{
				playerGameMap[playerIP] = newGameInstance;
			}
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