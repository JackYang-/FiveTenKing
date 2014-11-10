var socket = io();
$(document).ready(function () {
	$('form').submit(function(){
		socket.emit('chat message', $('#m').val());
		$('#m').val('');
		return false;
	});

	socket.on('log-message', function(msg){
		$('#messages').append($('<li>').text(msg));
	});

	socket.on('set-name', function(msg) {
		$('#player-dropdown').html(msg);
	});

	$('#pf-save-button').click(function () {
		var newName = $('#pf-new-name').val();
		socket.emit('set-new-name', newName);
		$('#myModal').modal('toggle');
	});
	
	$('#player-is-ready').click(function() {
		socket.emit('player-is-ready');
	});
});