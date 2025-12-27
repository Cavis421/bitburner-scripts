/**
 * ANSICodes library  (ANSICodes.js)  v1.0.1
 *
 * A collection of ANSI codes and functions for changing how text in the terminal window is displayed.
 *
 * Usage:
 * Add the following to the top of your script:

import * as ANSI from "./ANSICodes.js";

 * followed by the JSDoc type declarations shown below.  Then start your main() function like this:

export async function main(ns) {
	/**
	 * ANSICodes.js properties and methods.
	 *
	 * @type	{typeANSI}	ansi
	 **</>
	const ansi = ANSI;

 * (But change the "</>" to just a "/".)
 *
 * After that, you can access the ANSI codes by doing things like this:

ns.tprint(ansi.TxtCyan + "This text will be colored cyan." + ansi.TxtMagenta + "  And this will be magenta colored text.");

 **/

// vvv  Start of JSDoc type declarations  vvv
/**
 * BkgRGB: Returns an ANSI string you can print to set the background color of the text which follows to a given RGB color.
 *
 * @callback					typeBkgRGB
 * @param		{number}		red				0 - 255; default = 255
 * @param		{number}		green			0 - 255; default = 255
 * @param		{number}		blue			0 - 255; default = 255
 * @returns		{string}						An ANSI string to set the RGB background color.
 **/
/**
 * TxtRGB: Returns an ANSI string you can print to set the color of the text which follows to a given RGB color.
 *
 * @callback					typeTxtRGB
 * @param		{number}		red				0 - 255; default = 255
 * @param		{number}		green			0 - 255; default = 255
 * @param		{number}		blue			0 - 255; default = 255
 * @returns		{string}						An ANSI string to set the RGB text color.
 **/
/**
 * Strip: Returns the string stripped of any ANSI codes.
 *
 * @callback					typeStrip
 * @param		{string}		txt				Input string.
 * @returns		{string}						The given string, but with any ANSI codes removed.
 **/
/**
 * @typedef		{Object}		typeANSI		The type definition object for the types in ANSICodes.js.
 * @property	{typeBkgRGB}	BkgRGB			Returns an ANSI string to set the background color to a given RGB color.
 * @property	{typeStrip}		Strip			Returns the string stripped of any ANSI codes.
 * @property	{typeTxtRGB}	TxtRGB			Returns an ANSI string to set the text color to a given RGB color.
 * @property	{string}		TxtDefault		Default text color
 * @property	{string}		BkgDefault		Default background color
 * @property	{string}		TxtBlack		Black text
 * @property	{string}		BkgBlack		Black background
 * @property	{string}		TxtRed			Red text
 * @property	{string}		BkgRed			Red background
 * @property	{string}		TxtOrange		"Websafe" orange text
 * @property	{string}		BkgOrange		"Websafe" orange background
 * @property	{string}		TxtYellow		Yellow text
 * @property	{string}		BkgYellow		Yellow background
 * @property	{string}		TxtGreen		Green text
 * @property	{string}		BkgGreen		Green background
 * @property	{string}		TxtBlue			Blue text
 * @property	{string}		BkgBlue			Blue background
 * @property	{string}		TxtPurple		"Websafe" purple text
 * @property	{string}		BkgPurple		"Websafe" purple background
 * @property	{string}		TxtPurpleL		"Charisma" purple text
 * @property	{string}		BkgPurpleL		"Charisma" purple background
 * @property	{string}		TxtMagenta		Magenta text
 * @property	{string}		BkgMagenta		Magenta background
 * @property	{string}		TxtCyan			Cyan text
 * @property	{string}		BkgCyan			Cyan background
 * @property	{string}		TxtWhite		White text
 * @property	{string}		BkgWhite		White background
 * @property	{string}		Bold			Bold text
 * @property	{string}		Faint			Faint text
 * @property	{string}		NormalIntensity	Cancels Bold and Faint text
 * @property	{string}		Italic			Italic text
 * @property	{string}		NotItalic		Cancels italic text
 * @property	{string}		Underline		Underlined text
 * @property	{string}		NoUnderline		Cancels underlined text
 * @property	{string}		Blink			Blinking text
 * @property	{string}		NoBlink			Cancels blinking text
 * @property	{string}		Invert			Inverted text
 * @property	{string}		NotInverted		Cancels inverted text
 * @property	{string}		Invisible		Invisible text
 * @property	{string}		Reveal			Cancels invisible text
 * @property	{string}		Strikethrough	Strikethrough text
 * @property	{string}		NoStrikethrough	Cancels strikethrough text
 * @property	{string}		Reset			Cancels all style and color changes
 **/
// ^^^  End of JSDoc type declarations  ^^^

//  -- Color functions --
/**
 * BkgRGB: Returns an ANSI string to set the background color to a given RGB color.
 *
 * @param		{number}		red				0 - 255; default = 255
 * @param		{number}		green			0 - 255; default = 255
 * @param		{number}		blue			0 - 255; default = 255
 * @returns		{string}						An ANSI string to set the RGB background color.
 **/
export function BkgRGB (red = 255, green = 255, blue = 255) {
	function fixParam (param) {
		if (typeof param == 'string') {
			param = parseInt(param);
		}
		return Math.min(Math.max(param, 0), 255);
	}

	return "\u001b[48;2;" + fixParam(red) + ";" + fixParam(green) + ";" + fixParam(blue) + "m";
}

/**
 * TxtRGB: Returns an ANSI string to set the text color to a given RGB color.
 *
 * @param	{number}	red		0 - 255; default = 255
 * @param	{number}	green	0 - 255; default = 255
 * @param	{number}	blue	0 - 255; default = 255
 * @returns	{string}			An ANSI string to set the RGB text color.
 **/
export function TxtRGB (red = 255, green = 255, blue = 255) {
	function fixParam (param) {
		if (typeof param == 'string') {
			param = parseInt(param);
		}
		return Math.min(Math.max(param, 0), 255);
	}

	return "\u001b[38;2;" + fixParam(red) + ";" + fixParam(green) + ";" + fixParam(blue) + "m";
}

/**
 * Strip: Returns the string stripped of any ANSI codes.  This is useful for determining the number of
 * 		  visible characters in a string that contains ANSI codes (i.e. getting its "correct" length).
 *
 * @param	{string}	txt 	Input string.
 * @returns	{string}			The given string, but with any ANSI codes removed.
 **/
export function Strip (txt) {
	var result = txt, pos = result.indexOf("\u001b["), end = pos + 2, tmp = "";
	while (pos >= 0) {
		while ((end < result.length - 1) && ("01234567890;".includes(result.substring(end, end + 1)))) {
			end += 1;
		}
		tmp = "";
		if (pos > 0) {
			tmp = result.substring(0, pos);
		}
		if (end < result.length - 1) {
			tmp += result.substring(end + 1, result.length);
		}
		result = tmp;
		pos = result.indexOf("\u001b[");
		end = pos + 2;
	}
	return result;
}


//  -- Color codes --

// NOTE: The "light colored" [9#m and [10#m color codes currently aren't supported in Bitburner.

export const TxtDefault		 = "\u001b[39m";  // Default text color
export const BkgDefault		 = "\u001b[49m";  // Default background color

export const TxtBlack		 = "\u001b[30m";
export const BkgBlack		 = "\u001b[40m";
export const TxtBlackL		 = "\u001b[90m";
export const BkgBlackL		 = "\u001b[100m";

export const TxtDkGray		 = "\u001b[90m";   // a.k.a. "bright black"
export const BkgDkGray		 = "\u001b[100m";  // a.k.a. "bright black"
export const TxtDkGrey		 = "\u001b[90m";   // a.k.a. "bright black"; UK spelling
export const BkgDkGrey		 = "\u001b[100m";  // a.k.a. "bright black"; UK spelling

export const TxtRed			 = "\u001b[31m";
export const BkgRed			 = "\u001b[41m";
export const TxtRedL		 = "\u001b[91m";
export const BkgRedL		 = "\u001b[101m";

export const TxtOrange		 = TxtRGB(255, 102, 0);  // "Websafe" orange
export const BkgOrange		 = BkgRGB(255, 102, 0);  // "Websafe" orange

export const TxtYellow		 = "\u001b[33m";
export const BkgYellow		 = "\u001b[43m";
export const TxtYellowL		 = "\u001b[93m";
export const BkgYellowL		 = "\u001b[103m";

export const TxtGreen		 = "\u001b[32m";
export const BkgGreen		 = "\u001b[42m";
export const TxtGreenL		 = "\u001b[92m";
export const BkgGreenL		 = "\u001b[102m";

export const TxtBlue		 = "\u001b[34m";
export const BkgBlue		 = "\u001b[44m";
export const TxtBlueL		 = "\u001b[94m";
export const BkgBlueL		 = "\u001b[104m";

export const TxtPurple		 = TxtRGB(102, 0, 153);  // "Websafe" purple
export const BkgPurple		 = BkgRGB(102, 0, 153);  // "Websafe" purple
export const TxtPurpleL		 = TxtRGB(166, 113, 209);  // "Charisma" purple
export const BkgPurpleL		 = BkgRGB(166, 113, 209);  // "Charisma" purple

export const TxtMagenta		 = "\u001b[35m";
export const BkgMagenta		 = "\u001b[45m";
export const TxtMagentaL	 = "\u001b[95m";
export const BkgMagentaL	 = "\u001b[105m";

export const TxtCyan		 = "\u001b[36m";
export const BkgCyan		 = "\u001b[46m";
export const TxtCyanL		 = "\u001b[96m";
export const BkgCyanL		 = "\u001b[106m";

export const TxtWhite		 = "\u001b[37m";
export const BkgWhite		 = "\u001b[47m";
export const TxtWhiteL		 = "\u001b[97m";
export const BkgWhiteL		 = "\u001b[107m";


//  -- Style codes --
export const Bold			 = "\u001b[1m";
export const Faint			 = "\u001b[2m";
export const NormalIntensity = "\u001b[22m";  // Cancels bold and faint.
export const Italic			 = "\u001b[3m";
export const NotItalic		 = "\u001b[23m";  // Cancels italic
export const Underline		 = "\u001b[4m";
export const NoUnderline	 = "\u001b[24m";  // Cancels underline
export const Blink			 = "\u001b[5m";
export const NoBlink		 = "\u001b[25m";  // Cancels blink
export const Invert			 = "\u001b[7m";
export const NotInverted	 = "\u001b[27m";  // Cancels invert
export const Invisible		 = "\u001b[8m";
export const Reveal			 = "\u001b[28m";  // Cancels invisible
export const Strikethrough	 = "\u001b[9m";
export const NoStrikethrough = "\u001b[29m";  // Cancels strikethrough


/**
 * Cancels all style and color changes.
 **/
export const Reset			 = "\u001b[0m";