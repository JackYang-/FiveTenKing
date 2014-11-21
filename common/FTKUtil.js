(function () {
//Contains code that does common tasks around the game
var FTKUtil = function ()
{
	this.varTypes =
	{
		INT: "int",
		ARRAY: "array"
	};
	
	//Summary: generate a unique ID to be used for socketIO chatrooms
	this.getGUID = function() 
	{
		return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
	}
	
	//Summary: create a random 16 bit character
	function s4() 
	{
		return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
	}
	
	//Summary: takes in an object, a list of types and a list of properties and evaluates whether the object meets the criteria
	this.passTypeCheck = function(item, typeList, propertyList)
	{
		if (!item)
		{
			console.log("FTKUtil Type Check: object is null, 0, empty string, false, NaN, or undefined.");
			return false;
		}
		if (!(Array.isArray(typeList)))
		{
			console.log("FTKUtil Type Check: passed in list of types is not an array.");
			return false;
		}
		if (!(Array.isArray(propertyList)))
		{
			console.log("FTKUtil Type Check: passed in list of properties is not an array.");
			return false;
		}
		for (var i = 0; i < typeList.length; i ++)
		{
			if (typeList[i] === this.varTypes.INT && isNumeric(item))
			{
				//console.log("FTKUtil Type Check: item is a number."); 
			}
			else if (typeList[i] === this.varTypes.ARRAY && Array.isArray(item))
			{
				//console.log("FTKUtil Type Check: item is an array.");
			}
			else
			{
				console.log("FTKUtil Type Check: check failed on " + typeList[i] + ". The object is of the wrong type or the type is not recognized.");
				return false;
			}
		}
		for (var i = 0; i < propertyList.length; i ++)
		{
			if (!(item.hasOwnProperty(propertyList[i])))
			{
				console.log("FTKUtil Type Check: the object does not have the property " + propertyList[i] + ".");
				return false;
			}
		}
		//console.log("FTKUtil Type Check: object passed all specifications.");
		return true;
	}

	//Summary: takes in a player object and return name(ip)
	this.getDisplay = function(player)
	{
		if (!this.passTypeCheck(player, [], ["name", "ip"]))
		{
			console.log("FTKUtil getConsoleName ERROR: object is not a player.");
			return "";
		}
		return player.name + "(" + player.ip + ")";
	}
	
	function isNumeric(item)
	{
		return !isNaN(item);
	}
}
module.exports.FTKUtil = FTKUtil;
}());