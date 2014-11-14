(function () {
var socket = io();
var cardsInHand = [];
$(document).ready(function () {

	$('#button-area').hide();
	
	//accept log messages; will drop scrollbar to bottom every time a new message is received
	socket.on('log-message', function(msg){
		logMessage(msg, "normal");
	});	
	socket.on('warning-message', function(msg) {
		logMessage(msg, "warning");
	});
	socket.on('error-message', function(msg) {
		logMessage(msg, "error");
	});
	socket.on('success-message', function(msg) {
		logMessage(msg, "success");
	});
	
	socket.on('chat-message', function(msg) {
		chatMessage(msg);
	});
	
	//called on name change success
	socket.on('set-name', function(msg) {
		$('#player-dropdown').html(msg);
	});
	
	//when a card is dealt, add it to the hand
	socket.on('ftk-dealt-card', function(card) {
		console.log('Card is being dealt.');
		cardsInHand.push(card);
	});
	
	//when dealing is finished, initialize game-area
	socket.on('ftk-dealing-finished', function () {
		console.log('Dealing finished.');
		$('#button-area').show();
		displayHand();
	});
	
	socket.on('ftk-latest-play', function (cards) {
		console.log('Setting latest play.');
		displayToField(cards);
	});
	
	socket.on('ftk-recover-game-session', function () {
		console.log('Recovering game session.');
		cardsInHand = [];
		$('#player-is-ready').attr('disabled', 'disabled');
	});

	socket.on('ftk-clear-display', function () {
		$('#field-display').empty();
	});
	
	socket.on('first-visit', function () {
		$('#introduction-game-rules').modal('toggle');
	});
	
	socket.on('desktop-notification', function (msg) {
		sendNotification(msg);
	});
	
	//this is the button click that saves user profile information
	$('#pf-save-button').click(function () {
		var newName = $('#pf-new-name').val();
		socket.emit('set-new-name', newName);
		$('#myModal').modal('toggle');
	});
	
	$('#view-rules').click(function () {
		$('#introduction-game-rules').modal('toggle');
	});
	
	//button click that lets user enter a queue
	$('#player-is-ready').click(function() {
		cardsInHand = [];
		$('#player-is-ready').attr('disabled', 'disabled');
		socket.emit('player-is-ready');
	});
	
	$('#player-quit-game').click(function () {
		socket.emit('player-quit-game');
		$('#player-is-ready').removeAttr('disabled');
		$('#cardholder').empty();
		$('#field-display').empty();
	});
	
	$('#clear-logs').click(function () {
		$('#messages').empty();
	});
	
	//button click that lets user play the selected cards in hand
	$('#ftk-play-hand').click(function () {
		playSelectedCards();
	});
	
	//button click for pass
	$('#ftk-pass').click(function () {
		passTurn();
	});
	
	$('#chat-box').keypress(function (e) {
		if (e.which == 13)
		{
			$('#chat-form').submit();
			e.preventDefault();
		}
	});
	
	$('#chat-form').submit(function () {
		var text = $('#chat-box').val();
		//alert(text);
		socket.emit('chat-message', text);
		$('#chat-box').val('');
		return false;
	});
	
	$('#enable-notifications').click(function () {
		if (!Notification) {
			alert('Please use a modern version of your browser.');
			return;
		  }

		if (Notification.permission !== "granted") {
			//alert("No notification permissions");
			Notification.requestPermission();
		}
		else
		{
			//alert("Notification permissions granted.");
		}
		return;
	});
});

//when mouse hovers over card, raise it
$(document).on('mouseover', '.cardsInHand', function (e) {
	var thisThing = $(this);
	var position = thisThing.position();
	thisThing.css("top", (position.top - 20) + "px");
});
//when mouse stops hovering card, lower it
$(document).on('mouseout', '.cardsInHand', function (e) {
	var thisThing = $(this);
	var position = thisThing.position();
	thisThing.css("top", (position.top + 20) + "px");
});
//when a hovered card is clicked, prevent it from being lowered and tag it as selected
$(document).on('click', '.cardsInHand', function (e) {
	var thisThing = $(this);
	thisThing.removeClass("cardsInHand");
	thisThing.addClass("cardsReady");
});
//clicking a selected card un-tags it so that it will be lowered
$(document).on('click', '.cardsReady', function (e) {
	var thisThing = $(this);
	thisThing.removeClass("cardsReady");
	thisThing.addClass("cardsInHand");
});

function sendNotification (msg)
{
	if (!Notification) {
			alert('Please use a modern version of your browser.');
			return;
	}
	if (Notification.permission === "granted")
	{
		var notification = new Notification('Five Ten King', {
			//icon: 'http://cdn.sstatic.net/stackexchange/img/logos/so/so-icon.png',
			icon: 'cards_png/sk.png',
			body: msg,
		});
		notification.onclick = function () {
			window.focus();
		}
		setTimeout(function () {
			notification.close();
		}, 5000);
	}
}

function passTurn()
{
	socket.emit('ftk-move', 'ftkcmd-pass-turn', 'pass-turn', function (approved) {
	
	});
}

//assembles the list of cards to play and requests to play it
//if play is successful, remove the played cards from the hand, display the played cards in field-display and re-display the hand
function playSelectedCards()
{
	var cardsToPlay = [];
	var selectedIndices = [];
	$('.cardsReady').each(function (index, value) {
		var arrayIndex = $(this).attr("index");
		selectedIndices.push(arrayIndex);
		cardsToPlay.push(cardsInHand[arrayIndex]);
	});
	
	if (cardsToPlay.length <= 0)
	{
		logMessage('Can\'t make a move without playing a card. Click \'Pass\' to pass your turn.');
		return;
	}
	
	socket.emit('ftk-move', 'ftkcmd-make-play', cardsToPlay, function (approved) {
		if (approved)
		{
			selectedIndices.sort(function (a, b) {
				return b - a; //sort selectedIndices in *reverse* order so that when splicing, no elements get displaced
			});
			for (var i = 0; i < selectedIndices.length; i ++) //remove each played cards from hand
			{
				cardsInHand.splice(selectedIndices[i], 1);
			}
			displayHand();
			
			//displayToField(cardsToPlay);
		}
		else
		{
			logMessage('Play rejected.', 'error');
		}
	});
}

function displayToField(cards)
{
	cards.sort(function (a, b) {
		return a.value - b.value; //sort in ascending order because the display loop prepends all the cards so the cards get flipped
	});
	
	$('#field-display').empty();
	for (var i = 0; i < cards.length; i ++)
	{
		$('#field-display').prepend("<img src='cards_png/" + cards[i].card + ".png'>");
	}
}

//shows all the cards in the players hand in stacked fashion; after each call this function adjusts the location of the field display
function displayHand()
{
	var gameboardWidth = document.getElementById("gameboard").offsetWidth;
	var maxCardsPerLine = Math.floor((gameboardWidth - 100)/15);
	var numCardsOnCurrentLine = 0;
	var lineNum = 0;
	var numCardsDisplayed = 0;
	$('#cardholder').empty();
	cardsInHand.sort(function (a, b) {
		return b.value - a.value;
	});
	while (numCardsDisplayed < cardsInHand.length)
	{
		var topOffset = lineNum * 125;
		var leftOffset = numCardsOnCurrentLine * 15;
		$('#cardholder').append("<img class='cardsInHand' index='" + numCardsDisplayed + "' src='cards_png/" + cardsInHand[numCardsDisplayed].card + ".png' style='position:absolute;top:" + (topOffset + 25) + "px;left:" + leftOffset + "px;z-index:" + numCardsDisplayed +"'>");
		
		numCardsDisplayed ++;
		numCardsOnCurrentLine ++;
		if (numCardsOnCurrentLine >= maxCardsPerLine)
		{
			numCardsOnCurrentLine = 0;
			lineNum ++;
		}
	}
	setFieldDisplay(lineNum + 1);
}

function setFieldDisplay(lineNumber)
{
	$('#field-display').css("top", lineNumber * 125 + 40);
}

function logMessage (message, type)
{
	var messageType = "";
	if (type === "normal")
	{
		messageType = "alert-info normal-message";
	}
	else if (type === "warning")
	{
		messageType = "alert-warning warning-message";
	}
	else if (type === "error")
	{
		messageType = "alert-danger error-message";
	}
	else if (type === "success")
	{
		messageType = "alert-success success-message";
	}
	$('#messages').append($('<li class="alert ' + messageType + '"> role="alert"').text(message));
	var messageBox = document.getElementById("message-holder");
	messageBox.scrollTop = messageBox.scrollHeight;
}
})();

function chatMessage (message)
{
	$('#messages').append($('<li>').text(message));
	var messageBox = document.getElementById("message-holder");
	messageBox.scrollTop = messageBox.scrollHeight;
}