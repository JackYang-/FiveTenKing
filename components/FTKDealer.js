(function () {
var FTKDealer = function (deckCount)
{
	//Sanity check
	if (!deckCount || deckCount <= 0)
	{
		console.log("FTKDealer: ERROR: deck count was not initialized correctly; its value is either undefined or less than 0.");
		return;
	}

	//Hardcoded mapping value; might want to change to a config setting?
	var deckAssembleMapping = ["3", "4", "5", "6", "7", "8", "9", "10", "j", "q", "k", "1", "2"];
	var suitMapping = ["d", "s", "h", "c"];
	
	var dealersCards = []; //Example: [{card: 'd3', suit: 'd',  value:0}]
	
	//Summary: add a new deck to the existing list of dealer's cards
	//Note: multiple calls will add multiple copies to dealer's cards
	function addNewDeckCopy()
	{
		for (var i = 0; i < deckAssembleMapping.length; i ++)
		{
			for (var j = 0; j < suitMapping.length; j ++)
			{
				dealersCards.push({card: suitMapping[j] + deckAssembleMapping[i], suit: suitMapping[j], value: i});
			}
		}
		dealersCards.push({card: "jb", value: deckAssembleMapping.length});
		dealersCards.push({card: "jr", value: (deckAssembleMapping.length + 1)});
	}
	
	//Summary: shuffles the existing list of dealer's cards
	//Note: algorithm is iterating through each element and swapping with a random element further down the array
	function shuffleDeck()
	{
		for (var i = 0; i < dealersCards.length - 1; i ++)
		{
			var range = dealersCards.length - 1 - i;
			var newIndex = Math.floor(Math.random() * range) + i + 1;
			var temp = dealersCards[i];
			dealersCards[i] = dealersCards[newIndex];
			dealersCards[newIndex] = temp;
		}
	}
	
	//Summary: grabs the top card in the dealer's cards
	//Note: should only be called to distribute cards after the deck has already been shuffled
	//		this function also alters the length of the deck, beware when using for loops!
	function getNextCard()
	{
		if (dealersCards.length > 0)
		{
			var card = dealersCards.splice(0, 1);
			return card[0];
		}
		else
		{
			return false;
		}
	}
	
	//populate dealers cards with the appropriate number of decks
	for (var i = 0; i < deckCount; i ++)
	{
		addNewDeckCopy();
	}
	//shuffle deck
	shuffleDeck();
	
	//Summary: takes in an array of players and populate each element's hand field
	//Note: this function will alter each element in the list by initializing a hand field as an empty array even if it doesn't exist
	//		it will also return the ip of the player who is going first
	//		it will also emit to the sockets to notify dealt cards
	this.dealCards = function (playersList)
	{
		if (!playersList)
		{
			console.log("FTKDealer: ERROR: passed in player list not found; null or undefined.");
			return;
		}
		if (!(Array.isArray(playersList))) //checking if object is array
		{
			console.log("FTKDealer: ERROR: dealCards called while passing data that is not an array; the type is", Object.prototype.toString.call(playersList), ".");
			return;
		}
		if (playersList.length <= 0)
		{
			console.log("FTKDealer: ERROR: player list is empty.");
			return;
		}
		for (var i = 0; i < playersList.length; i ++) //resetting each players hand
		{
			if (!(playersList[i].hasOwnProperty('hand')))
			{
				console.log("FTKDealer: WARNING: playersList at index", i, "does not have the hand property. The property will be added.");
			}
			playersList[i].hand = [];
		}
		
		var counter = 0;
		var maxAllowedCounter = playersList.length - 1;
		
		var firstTurnPlayer = "";
		while (dealersCards.length > 0)
		{
			var card = getNextCard();
			playersList[counter].hand.push(card);
			
			if (card.card === 'd3')
			{
				firstTurnPlayer = playersList[counter].player;
				console.log("FTKDealer: First diamond of 3 was dealt to " + firstTurnPlayer.name + "(" + firstTurnPlayer.ip + ").");
				for (var i = 0; i < playersList.length; i ++)
				{
					playersList[i].socket.emit('log-message', firstTurnPlayer.name + ' has snatched the first turn by drawing the first 3 of diamonds.');
				}
			}
			
			playersList[counter].socket.emit('ftk-dealt-card', card);
			counter ++;
			counter = counter > maxAllowedCounter ? 0 : counter;
		}
		
		for (var i = 0; i < playersList.length; i ++)
		{
			playersList[i].socket.emit('ftk-dealing-finished');
		}
		return firstTurnPlayer.ip;
	}
}

module.exports.FTKDealer = FTKDealer;
}());