(function () {
var FTKMessenger = function(io, players)
{
	var FTKUtil = require("./FTKUtil.js");
	var util = new FTKUtil.FTKUtil();
	
	if (!(util.passTypeCheck(players, [util.varTypes.ARRAY], [])))
	{
		console.log("FTKMessenger ERROR: initialized with non-array data.");
		return;
	}
	
	var id = util.getGUID();
	var socketAtIP = {};
	console.log("FTKMessenger: new messenger instance created with ID " + id + ".");
	
	//Summary: add a socket to the messenger
	this.Add = function(socket)
	{
		console.log("FTKMessenger: Adding new socket to room " + id + ".");
		//io.to(id).emit('log-message', "New person has joined this room.");
		socket.join(id);
	}
	
	//adds all the initialized sockets to the messenger and create a map of ip to sockets
	for (var i = 0; i < players.length; i ++)
	{
		this.Add(players[i].socket);
		socketAtIP[players[i].ip] = players[i].socket;
	}
	
	//Summary: send a command to the specified ip
	this.SendToIP = function (ip, command, parameter)
	{
		if (!command || !ip)
		{
			console.log("FTKMessenger ERROR: SendToIP received bad IP or command");
		}
		if (!parameter)
		{
			socketAtIP[ip].emit(command, parameter);
		}
		else
		{
			socketAtIP[ip].emit(command, parameter);
		}
	}
	
	//Summary: sends a command with one parameter to all of the sockets
	this.SendToAll = function (command, parameter)
	{
		if (!command)
		{
			console.log("FTKMessenger ERROR: SendToAll received bad command");
			return;
		}
		if (!parameter)
		{
			io.to(id).emit(command);
		}
		else
		{
			io.to(id).emit(command, parameter);
		}
	}
	
	
	//**************Functions below are wrappers for SendToIP and SendToAll
	//Summary: find the socket with the given ip and send a desktop notification with the given message
	this.SendNotificationToIP = function (ip, message)
	{
		//socketAtIP[ip].emit('desktop-notification', message);
		this.SendToIP(ip, 'desktop-notification', message);
	}
	
	this.SendMessageToAll = function(message, type)
	{
		var msgType = "";
		if (!message)
		{
			console.log("FTKMessenger ERROR: bad message.");
			return;
		}
		switch(type)
		{
			case "normal":
				msgType = "log-message";
				break;
			case "warning":
				msgType = "warning-message";
				break;
			case "error":
				msgType = "error-message";
				break;
			case "success":
				msgType = "success-message";
				break;
			default:
				console.log("FTKMessenger ERROR: message type " + type + " is not recognized.");
				return;		
		}
		//io.to(id).emit(msgType, message);
		this.SendToAll(msgType, message);
	}
}

module.exports.FTKMessenger = FTKMessenger;
}());