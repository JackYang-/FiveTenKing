var socket = io();
var cardsInHand = [];
$(document).ready(function () {

	$('form').submit(function(){
		socket.emit('chat message', $('#m').val());
		$('#m').val('');
		return false;
	});

	socket.on('log-message', function(msg){
		$('#messages').prepend($('<li>').text(msg));
	});

	socket.on('set-name', function(msg) {
		$('#player-dropdown').html(msg);
	});
	
	socket.on('ftk-dealt-card', function(card) {
		//$('#cardholder').append("<img src='cards_png/" + card.card + ".png'>");
		cardsInHand.push(card);
	});
	
	socket.on('ftk-dealing-finished', function () {
		displayDealtCards();
	});

	$('#pf-save-button').click(function () {
		var newName = $('#pf-new-name').val();
		socket.emit('set-new-name', newName);
		$('#myModal').modal('toggle');
	});
	
	$('#player-is-ready').click(function() {
		cardsInHand = [];
		$('#player-is-ready').attr('disabled', 'disabled');
		socket.emit('player-is-ready');
	});
});

$(document).on('mouseover', '.cardsInHand', function (e) {
	var thisThing = $(this);
	var position = thisThing.position();
	thisThing.css("top", (position.top - 20) + "px");
	//$(this).css("top", );
});
$(document).on('mouseout', '.cardsInHand', function (e) {
	var thisThing = $(this);
	var position = thisThing.position();
	thisThing.css("top", (position.top + 20) + "px");
});
$(document).on('click', '.cardsInHand', function (e) {
	var thisThing = $(this);
	thisThing.removeClass("cardsInHand");
	thisThing.addClass("cardsReady");
});
$(document).on('click', '.cardsReady', function (e) {
	var thisThing = $(this);
	thisThing.removeClass("cardsReady");
	thisThing.addClass("cardsInHand");
});

function displayDealtCards()
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
}