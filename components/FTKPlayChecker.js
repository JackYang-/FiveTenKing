(function () {
var FTKPlayChecker = function ()
{
	var deckAssembleMapping = ["3", "4", "5", "6", "7", "8", "9", "10", "j", "q", "k", "1", "2"];
	this.playTypes = 
	{
		NoPlay: {name: "No Play", overrideFactor: 0},
		Unknown: {name: "Unknown Play", overrideFactor: 0},
		Single: {name: "Single", overrideFactor: 1},
		SingleStraight: {name: "Single Straight", overrideFactor: 1},
		DoubleStraight: {name: "Double Straight", overrideFactor: 1},
		TripleStraight: {name: "Triple Straight", overrideFactor: 1},
		FiveTenKing: {name: "Five Ten King", overrideFactor: 2},
		FiveTenKingSameSuit: {name: "Same Suit Five Ten King", overrideFactor: 3},
		Quad: {name: "Quad", overrideFactor: 4}
	};
	var playTypes ={
		NoPlay: {name: "No Play", overrideFactor: 0},
		Unknown: {name: "Unknown Play", overrideFactor: 0},
		Single: {name: "Single", overrideFactor: 1},
		SingleStraight: {name: "Single Straight", overrideFactor: 1},
		DoubleStraight: {name: "Double Straight", overrideFactor: 1},
		TripleStraight: {name: "Triple Straight", overrideFactor: 1},
		FiveTenKing: {name: "Five Ten King", overrideFactor: 2},
		FiveTenKingSameSuit: {name: "Same Suit Five Ten King", overrideFactor: 3},
		Quad: {name: "Quad", overrideFactor: 4}
	};
	
	this.isValidPlay = function (play)
	{
		return !(!play || play.type.name === playTypes.Unknown.name || play.type.name === playTypes.NoPlay.name);
	}
	this.firstTrumpsSecond = function (firstPlay, secondPlay)
	{
		return firstPlay.type.overrideFactor > secondPlay.type.overrideFactor || //overrideFactor is greater OR:
			(firstPlay.type.overrideFactor === secondPlay.type.overrideFactor //same override factor and
			&& firstPlay.type.name === secondPlay.type.name //same type and
			&& firstPlay.strength > secondPlay.strength //greater strength and
			&& firstPlay.length === secondPlay.length); //same length
	}
	this.getNoPlay = function ()
	{
		return {type: playTypes.NoPlay, strength: 0, length: 0};
	}
	this.calculatePlay = function (cardsToPlay)//returns an object of the form {type: int, strength: int, length: int}
	{
		if (cardsToPlay.length === 1) //checking for singles
		{
			return {type: playTypes.Single, strength: cardsToPlay[0].value, length: 0};
		}
		if (cardsToPlay.length === 2) //checking for doubles; ensure both cards have the same value for a valid double
		{
			if (cardsToPlay[0].value === cardsToPlay[1].value)
			{
				return {type: playTypes.DoubleStraight, strength: cardsToPlay[0].value, length: 1};
			}
			else
			{
				return {type: playTypes.Unknown, strength: 0, length: 0};
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
				if (cardValue === deckAssembleMapping.indexOf("5"))
				{
					five = true;
				}
				if (cardValue === deckAssembleMapping.indexOf("10"))
				{
					ten = true;
				}
				if (cardValue === deckAssembleMapping.indexOf("k"))
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
					return {type: playTypes.FiveTenKingSameSuit, strength: 0, length :0};
				}
				else
				{
					return {type: playTypes.FiveTenKing, strength: 0, length: 0};
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
				return {type: playTypes.Quad, strength: firstValue, length: 0}; 
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
		var complexResult = calculateComplexPlay(cardMap, true); //this returns more than you will need, so we only extract the pieces we need
		
		return {type: complexResult.type, strength: complexResult.strength, length: complexResult.length};
		
	}
	//This function is reached when the play is not a single, not a double, not a five ten king and not a quad
	function calculateComplexPlay (cardMap, checkTwosAndJokers)
	{
		var returnObject = {type: playTypes.Unknown, strength: 0, length: 0};
		
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
			possiblePlays = calculateComplexPlay(cardMap, false); //by recursion, find all the possible valid plays with the rest of the elements in the cardMap
			if (possiblePlays.length === 0 && consecutiveTriplesInScope > 0 && consecutiveTriplesInScope * 2 >= stragglers) //this should be true when there are no cards other than 2's and jokers in the play
			{																				//and when there's a triple 2 in play
				//console.log("triple 2 detected");
				returnObject.type = playTypes.TripleStraight;
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
					if (isSameType(possiblePlays[i].type, playTypes.SingleStraight) && numCards === 0) //using numCards instead of stragglers because triple 2's cannot be played together with straights
					{
						console.log("evaluation complete: single straight");
						return possiblePlays[i];
					}
					else if (isSameType(possiblePlays[i].type, playTypes.DoubleStraight) && numCards === 0)
					{
						console.log("evaluation complete: double straight");
						return possiblePlays[i];
					}
					else if (isSameType(possiblePlays[i].type, playTypes.TripleStraight))
					{
						if (possiblePlays[i].numTriples * 2 >= possiblePlays[i].numStragglers + numCards)
						{
							console.log("evaluation complete: triple straight");
							return possiblePlays[i];
						}
					}
					else if (isSameType(possiblePlays[i].type, playTypes.Unknown) && possiblePlays[i].numStragglers > 0)
					{
						if (consecutiveTriplesInScope * 2 >= (possiblePlays[i].numStragglers))
						{
							console.log("evaluation complete: triple straight of two's");
							return {type: playTypes.TripleStraight, strength: 12, length: 1};
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
								possiblePlays.push({type: playTypes.TripleStraight, strength: triTracerStart, length: triLength, numTriples: triLength, numStragglers: stragglers});
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
								possiblePlays.push({type: playTypes.TripleStraight, strength: triTracerStart, length: triLength, numTriples: triLength, numStragglers: stragglers});
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
							possiblePlays.push({type: playTypes.DoubleStraight, strength: dsTracerStart, length: dsLength, numTriples: 0, numStragglers: 0});
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
								possiblePlays.push({type: playTypes.DoubleStraight, strength: dsTracerStart, length: dsLength, numTriples: 0, numStragglers: 0});
								return possiblePlays;
							}
						}
						else if (cardMap[dsTracerIndex] >= 3) //we've seen a triple, there's hope! 
						{
							//console.log("double straight not possible but a triple has been spotted");
							stragglers += dsLength * 2;
							wipeMapFromIndex(cardMap, dsTracerIndex + 1);
							var potentialPlaysFromRest = calculateComplexPlay(cardMap, false);
							for (var k = potentialPlaysFromRest.length - 1; k >= 0; k --)
							{
								if (!isSameType(potentialPlaysFromRest[k].type, playTypes.TripleStraight))
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
							possiblePlays.push({type: playTypes.SingleStraight, strength: straightTracerStart, length: straightLength, numTriples: 0, numStragglers: 0});
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
								possiblePlays.push({type: playTypes.SingleStraight, strength: straightTracerStart, length: straightLength, numTriples: 0, numStragglers: 0});
								return possiblePlays;
							}
						}
						else if (cardMap[straightTracerIndex] >= 3) //we've seen a triple, there's hope! 
						{
							//console.log("straight not possible but a triple has been spotted");
							stragglers += straightLength;
							wipeMapFromIndex(cardMap, straightTracerIndex + 1);
							var potentialPlaysFromRest = calculateComplexPlay(cardMap, false);
							for (var k = potentialPlaysFromRest.length - 1; k >= 0; k --)
							{
								if (!isSameType(potentialPlaysFromRest[k].type, playTypes.TripleStraight))
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
				possiblePlays = calculateComplexPlay(cardMap, false);
				if (stragglers > 0)
				{
					//console.log("there are stragglers (nonzero breakpoint)");
					for (var i = possiblePlays.length - 1; i >= 0; i --) //iterate backwards to not displace elements when splicing
					{
						if (!isSameType(possiblePlays[i].type, playTypes.TripleStraight))
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
					possiblePlays.push({type: playTypes.Unknown, strength: 0, length: 0, numTriples: consecutiveTriplesInScope, numStragglers: stragglers});
					return possiblePlays;
				}
				else
				{
					//console.log("there are no stragglers (nonzero breakpoint)");
					return possiblePlays;
				}
			}
		}	
	}
}
module.exports.FTKPlayChecker = FTKPlayChecker;
}());