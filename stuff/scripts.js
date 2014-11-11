var socket = io();
var cardsInHand = [];
$(document).ready(function () {

	$('#button-area').hide();

	//accept log messages; will drop scrollbar to bottom every time a new message is received
	socket.on('log-message', function(msg){
		$('#messages').append($('<li>').text(msg));
		var messageBox = document.getElementById("log");
		messageBox.scrollTop = messageBox.scrollHeight;
	});	
	
	//called on name change success
	socket.on('set-name', function(msg) {
		$('#player-dropdown').html(msg);
	});
	
	//when a card is dealt, add it to the hand
	socket.on('ftk-dealt-card', function(card) {
		cardsInHand.push(card);
	});
	
	//when dealing is finished, initialize game-area
	socket.on('ftk-dealing-finished', function () {
		$('#button-area').show();
		displayHand();
	});

	//this is the button click that saves user profile information
	$('#pf-save-button').click(function () {
		var newName = $('#pf-new-name').val();
		socket.emit('set-new-name', newName);
		$('#myModal').modal('toggle');
	});
	
	//button click that lets user enter a queue
	$('#player-is-ready').click(function() {
		cardsInHand = [];
		$('#player-is-ready').attr('disabled', 'disabled');
		socket.emit('player-is-ready');
	});
	
	//button click that lets user play the selected cards in hand
	$('#ftk-play-hand').click(function () {
		playSelectedCards();
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
	
	//make socket request to play hand
	
	//assuming hand was played successfully, sort selectedIndices in reverse order so that when splicing, no elements get displaced
	selectedIndices.sort(function (a, b) {
		return b - a;
	});
	for (var i = 0; i < selectedIndices.length; i ++)
	{
		cardsInHand.splice(selectedIndices[i], 1);
	}
	displayHand();
	
	//sort in ascending order because the display loop prepends all the cards so the cards get flipped
	cardsToPlay.sort(function (a, b) {
		return a.value - b.value;
	});
	
	$('#field-display').empty();
	for (var i = 0; i < cardsToPlay.length; i ++)
	{
		$('#field-display').prepend("<img src='cards_png/" + cardsToPlay[i].card + ".png'>");
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