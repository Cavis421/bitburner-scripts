/**
 * augs.js  (9.35GB)  v1.0.2
 *
 * Sources:
 *      old - https://bitburner.readthedocs.io/en/latest/basicgameplay/factions.html
 *      new - https://github.com/bitburner-official/bitburner-src/blob/70eda40bb64ff6fae5c6aaadb472cc27c72ecd4c/src/PersonObjects/Player/PlayerObjectGeneralMethods.ts#L589
 **/

/**
 * ANSICodes library  (ANSICodes.js)  v1.0.0
 *
 * A collection of ANSI codes and functions for changing how text in the terminal window is displayed.
 **/
import * as ANSI from "./ANSICodes";
/**
 * BkgRGB: Returns an ANSI string you can print to set the background color of the text which follows to a given RGB color.
 *
 * @callback typeBkgRGB
 * @param		{number}		red				0 - 255; default = 255
 * @param		{number}		green			0 - 255; default = 255
 * @param		{number}		blue			0 - 255; default = 255
 * @return		{string}						An ANSI string to set the RGB background color.
 **/
/**
 * TxtRGB: Returns an ANSI string you can print to set the color of the text which follows to a given RGB color.
 *
 * @callback typeTxtRGB
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
 * @return		{string}						The given string, but with any ANSI codes removed.
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
/* -- End of ANSICodes types section -- */


/**
 * @param {NS} ns
 **/
export async function main(ns) {
	/**
	 * ANSICodes.js properties and methods.
	 *
	 * @type	{typeANSI}	ansi
	 **/
	const ansi = ANSI;

	/**
	 * sizeTextLeading: Returns the given text sized to len number of characters using leading spaces.
	 *
	 * @param	{string}	txt		The given value to make 'len' characters long.
	 * @param	{number}	len		The length to make the value in characters.
	 * @return	{string}			The resized string.
	 **/
	function sizeTextLeading (txt, len) {
		txt = "" + txt;
		if (len > txt.length) {
			txt = " ".repeat(len - txt.length) + txt;
		}
		return txt;
	}


	/* Main code */
	const valDR  = { true: "", false: ansi.TxtRed };
	const valDRx = { true: "", false: ansi.TxtDefault };
	const factionList = ["CyberSec", "Tian Di Hui", "Netburners",  // Early-game factions
						 "Sector-12", "Chongqing", "New Tokyo", "Ishima", "Aevum", "Volhaven",  // City factions
						 "NiteSec", "The Black Hand", "BitRunners",  // Hacker groups
						 "MegaCorp", "Blade Industries", "Four Sigma", "KuaiGong International", "NWO",  // Megacorporations
						 "OmniTek Incorporated", "ECorp", "Bachman & Associates", "Clarke Incorporated", "Fulcrum Secret Technologies",
						 "Slum Snakes", "Tetrads", "Silhouette", "Speakers for the Dead", "The Dark Army", "The Syndicate",  // Gangs
						 "The Covenant", "Daedalus", "Illuminati",  // Endgame factions
						 "Bladeburners", "Church of the Machine God", "Shadows of Anarchy"];  // BitNode factions
	const megacorps = ["megacorp", "blade", "4sigma", "kuai-gong", "nwo", "omnitek", "ecorp", "b-and-a", "clarkinc", "fulcrumtech"];
	/** @type {Player} */
	const plyr = ns.getPlayer(), factionCount = factionList.length;
	plyr.karma = ns.heart.break();
	var command, i;
	if (ns.args.length > 0) {
		command = ns.args[0];
	}
	var factStatus = Array(factionCount).fill(false);
	if (ns.fileExists("gFactions.txt", "home")) {  // Read stored settings file.
		factStatus = JSON.parse(ns.read("gFactions.txt"));
	}
	while (factStatus.length < factionCount) {  // Add indexes for any missing factions
		factStatus.push(false);
	}
	if ((command > 0) && (command <= factionCount)) {  // Toggle faction based on numbered argument passed to this script.
		factStatus[command - 1] = !factStatus[command - 1];
	}
	if ((command == "clear") || (command == "reset") || (command == "wipe")) {  // Allow user to clear the whole list.
		factStatus = Array(factionCount).fill(false);
	}
	if (command == "all") {  // Allow user to set the whole list.
		factStatus = Array(factionCount).fill(true);
	}
	ns.write("gFactions.txt", JSON.stringify(factStatus), "w");  // Update the stored settings file.

	/**
	 * Can't test these (currently) without the right Source Files:
	 * 		Faction reputation  (with SF4 - ns.singularity.getFactionRep())
	 *
	 * ToDo:
	 * 		Add Shadows of Anarchy
	 * 		Add BitNode factions(?).
	 **/

	// Faction tests
	var doneStatus = Array(factionCount).fill(ansi.TxtRed + " No " + ansi.TxtDefault);
	for (i = 0; i < factionCount; i++) {
		if (factStatus[i]) {
			doneStatus[i] = ansi.TxtGreen + "Done" + ansi.TxtDefault;
		} else if (plyr.factions.includes(factionList[i])) {  // Track if you're in the faction or not.
			factStatus[i] = true;
			doneStatus[i] = ansi.TxtYellow + " In " + ansi.TxtDefault;
		}
	}
	const chiefOfficerTypes = ["Chief Technology Officer", "Chief Financial Officer", "Chief Executive Officer"];
	var jobList = {}, chiefOfficer = false, spook = false, jobs = Object.entries(plyr.jobs);
	for (const [loadedCompanyName, loadedJobName] of jobs) {
		jobList[loadedCompanyName] = loadedJobName;
		if (chiefOfficerTypes.includes(loadedJobName)) {
			chiefOfficer = true;
		}
		if (["CIA", "NSA"].includes(loadedCompanyName)) {
			spook = true;
		}
	}

	// Backdoored server tests
	let CSEC = ansi.TxtRed, avmnite02h = ansi.TxtRed, IIII = ansi.TxtRed, run4theh111z = ansi.TxtRed, fulcrumassets = ansi.TxtRed;
	if (factStatus[0] || ns.getServer("CSEC").backdoorInstalled) {
		CSEC = "";
	} else if (ns.getServerRequiredHackingLevel("CSEC") <= plyr.skills.hacking) {
		CSEC = ansi.TxtYellow;
	}
	CSEC += "Backdoor CSEC" + (CSEC !== "" ? ansi.TxtDefault : "");
	if (factStatus[9] || ns.getServer("avmnite-02h").backdoorInstalled) {
		avmnite02h = "";
	} else if (ns.getServerRequiredHackingLevel("avmnite-02h") <= plyr.skills.hacking) {
		avmnite02h = ansi.TxtYellow;
	}
	avmnite02h += "Backdoor avmnite-02h" + (avmnite02h !== "" ? ansi.TxtDefault : "");
	if (factStatus[10] || ns.getServer("I.I.I.I").backdoorInstalled) {
		IIII = "";
	} else if (ns.getServerRequiredHackingLevel("I.I.I.I") <= plyr.skills.hacking) {
		IIII = ansi.TxtYellow;
	}
	IIII += "Backdoor I.I.I.I" + (IIII !== "" ? ansi.TxtDefault : "");
	if (factStatus[11] || ns.getServer("run4theh111z").backdoorInstalled) {
		run4theh111z = "";
	} else if (ns.getServerRequiredHackingLevel("run4theh111z") <= plyr.skills.hacking) {
		run4theh111z = ansi.TxtYellow;
	}
	run4theh111z += "Backdoor run4theh111z" + (run4theh111z !== "" ? ansi.TxtDefault : "");
	if (factStatus[21] || ns.getServer("fulcrumassets").backdoorInstalled) {
		fulcrumassets = "";
	} else if (ns.getServerRequiredHackingLevel("fulcrumassets") <= plyr.skills.hacking) {
		fulcrumassets = ansi.TxtYellow;
	}
	fulcrumassets += "Backdoor fulcrumassets" + (fulcrumassets !== "" ? ansi.TxtDefault : "");

	// Money tests
	let m1SS = plyr.money >=       1000000;
	let m1TDH = m1SS || factStatus[22];
	m1TDH = valDR[m1TDH] +   "$1m" + valDRx[m1TDH];
	m1SS = m1SS || factStatus[1];
	m1SS = valDR[m1SS] +   "$1m" + valDRx[m1SS];
	let  m10 = plyr.money >=      10000000 || factStatus[27];
	m10  =  valDR[m10] +  "$10m" +  valDRx[m10];
	let m15S12 = plyr.money >=      15000000;
	let m15S = m15S12 || factStatus[24];
	m15S =  valDR[m15S] +  "$15m" +  valDRx[m15S];
	m15S12 = m15S12 || factStatus[3];
	m15S12 =  valDR[m15S12] +  "$15m" +  valDRx[m15S12];
	let m20C = plyr.money >=      20000000;
	let m20NT = m20C ||  factStatus[5];
	m20NT = valDR[m20NT] +  "$20m" + valDRx[m20NT];
	m20C = m20C ||   factStatus[4];
	m20C = valDR[m20C] +  "$20m" + valDRx[m20C];
	let  m30 = plyr.money >=     30000000 ||  factStatus[6];
	m30  =  valDR[m30] +  "$30m" +  valDRx[m30];
	let  m40 = plyr.money >=     40000000 ||  factStatus[7];
	m40  =  valDR[m40] +  "$40m" +  valDRx[m40];
	let  m50 = plyr.money >=     50000000 ||  factStatus[8];
	m50  =  valDR[m50] +  "$50m" +  valDRx[m50];
	let  b75 = plyr.money >=  75000000000 || factStatus[28];
	b75  =  valDR[b75] +  "$75b" +  valDRx[b75];
	let b100 = plyr.money >= 100000000000 || factStatus[29];
	b100 = valDR[b100] + "$100b" + valDRx[b100];
	let b150 = plyr.money >= 150000000000 || factStatus[30];
	b150 = valDR[b150] + "$150b" + valDRx[b150];

	// RAM tests
	let ram32  = ns.getServerMaxRam("home") >=  32 ||  factStatus[9];
	ram32  =  valDR[ram32] + "Home RAM  32GB" +  valDRx[ram32];
	let ram64  = ns.getServerMaxRam("home") >=  64 || factStatus[10];
	ram64  =  valDR[ram64] + "Home RAM  64GB" +  valDRx[ram64];
	let ram128 = ns.getServerMaxRam("home") >= 128 || factStatus[11];
	ram128 = valDR[ram128] + "Home RAM 128GB" + valDRx[ram128];

	// Hacknet totals tests
	let hnLvls = 0, hnRAM = 0, hnCores = 0;
	for (i = 0; i < ns.hacknet.numNodes(); i++) {
		hnLvls  += ns.hacknet.getNodeStats(i).level;
		hnRAM   += ns.hacknet.getNodeStats(i).ram;
		hnCores += ns.hacknet.getNodeStats(i).cores;
	}
	hnLvls  = hnLvls  >= 100 || factStatus[2];
	hnLvls  =  valDR[hnLvls] + "Level 100" +  valDRx[hnLvls];
	hnRAM   = hnRAM   >=   8 || factStatus[2];
	hnRAM   =   valDR[hnRAM] +     "RAM 8" +   valDRx[hnRAM];
	hnCores = hnCores >=   4 || factStatus[2];
	hnCores = valDR[hnCores] +   "Cores 4" + valDRx[hnCores];

	// Hacking tests
	let   h50 = plyr.skills.hacking >=   50 ||  factStatus[1];
	h50   =   valDR[h50] +   "Hacking 50" +   valDRx[h50];
	let   h80 = plyr.skills.hacking >=   80 ||  factStatus[2];
	h80   =   valDR[h80] +   "Hacking 80" +   valDRx[h80];
	let  h100 = plyr.skills.hacking >=  100 || factStatus[25];
	h100  =  valDR[h100] +  "Hacking 100" +  valDRx[h100];
	let  h200 = plyr.skills.hacking >=  200 || factStatus[27];
	h200  =  valDR[h200] +  "Hacking 200" +  valDRx[h200];
	let  h300 = plyr.skills.hacking >=  300 || factStatus[26];
	h300  =  valDR[h300] +  "Hacking 300" +  valDRx[h300];
	let  h850 = plyr.skills.hacking >=  850 || factStatus[28];
	h850  =  valDR[h850] + "Hacking  850" +  valDRx[h850];
	let h1500 = plyr.skills.hacking >= 1500 || factStatus[30];
	h1500 = valDR[h1500] + "Hacking 1500" + valDRx[h1500];
	let h2500 = plyr.skills.hacking >= 2500 || factStatus[29];
	h2500 = valDR[h2500] + "Hacking 2500" + valDRx[h2500];

	// Combat stats tests
	let minCombatStats = Math.min(plyr.skills.agility, plyr.skills.defense, plyr.skills.dexterity, plyr.skills.strength);
	let    minCS30 = minCombatStats >=   30 || factStatus[22];
	minCS30   = valDR[minCS30]     + "All combat stats  30" + valDRx[minCS30];
	let    minCS75 = minCombatStats >=   75 || factStatus[23];
	minCS75   = valDR[minCS75]     + "All combat stats  75" + valDRx[minCS75];
	let   minCS200 = minCombatStats >=  200 || factStatus[27];
	minCS200  = valDR[minCS200]    + "All combat stats 200" + valDRx[minCS200];
	let minCS300SD = minCombatStats >=  300;
	let minCS300DA = minCS300SD || factStatus[26];
	minCS300DA = valDR[minCS300DA] + "All combat stats 300" + valDRx[minCS300DA];
	minCS300SD     = minCS300SD || factStatus[25];
	minCS300SD = valDR[minCS300SD] + "All combat stats 300" + valDRx[minCS300SD];
	let   minCS850 = minCombatStats >=  850 || factStatus[28];
	minCS850  =    valDR[minCS850] + "All combat stats  850" + valDRx[minCS850];
	let  minCS1200 = minCombatStats >= 1200 || factStatus[30];
	minCS1200  =  valDR[minCS1200] + "All combat stats 1200" + valDRx[minCS1200];
	let  minCS1500 = minCombatStats >= 1500 || factStatus[29];
	minCS1500 = valDR[minCS1500]   + "All combat stats 1500" + valDRx[minCS1500];

	// Location tests
	let inlocS12  = plyr.city == "Sector-12";
	let inlocAv   = plyr.city == "Aevum";
	let inlocCh   = plyr.city == "Chongqing";
	let inlocChDA = valDR[inlocCh || factStatus[26]] + "Be in Chongqing" + valDRx[inlocCh || factStatus[26]];
	let inlocNT   = plyr.city == "New Tokyo";
	let inlocIs   = plyr.city == "Ishima";
	let inlocVl   = plyr.city == "Volhaven";
	let inlocSA   = inlocS12 || inlocAv;
	let inlocSAS  = valDR[inlocSA || factStatus[27]] + "Be in Aevum or Sector-12" + valDRx[inlocSA || factStatus[27]];
	let inlocCNI  =  inlocCh || inlocNT || inlocIs;
	let inlocCNIT = inlocCNI || factStatus[23]
	inlocCNIT = valDR[inlocCNIT] + "Be in Chongqing, New Tokyo, or Ishima" + valDRx[inlocCNIT];
	inlocCNI  = valDR[inlocCNI || factStatus[1]] + "Be in Chongqing, New Tokyo, or Ishima" + valDRx[inlocCNI || factStatus[1]];
	inlocS12  = inlocS12 || factStatus[3];
	inlocS12  = valDR[inlocS12] + "Be in Sector-12" + valDRx[inlocS12];
	inlocCh   =  inlocCh || factStatus[4];
	inlocCh   =  valDR[inlocCh] + "Be in Chongqing" +  valDRx[inlocCh];
	inlocNT   =  inlocNT || factStatus[5];
	inlocNT   =  valDR[inlocNT] + "Be in New Tokyo" +  valDRx[inlocNT];
	inlocIs   =  inlocIs || factStatus[6];
	inlocIs   =  valDR[inlocIs] + "Be in Ishima"    +  valDRx[inlocIs];
	inlocAv   =  inlocAv || factStatus[7];
	inlocAv   =  valDR[inlocAv] + "Be in Aevum"     +  valDRx[inlocAv];
	inlocVl   =  inlocVl || factStatus[8];
	inlocVl   =  valDR[inlocVl] + "Be in Volhaven"  +  valDRx[inlocVl];

	// Kills tests
	let kills5  = plyr.numPeopleKilled >=  5 || factStatus[26];
	kills5  =  valDR[kills5] +  "5 people killed" +  valDRx[kills5];
	let kills30 = plyr.numPeopleKilled >= 30 || factStatus[25];
	kills30 = valDR[kills30] + "30 people killed" + valDRx[kills30];

	// Karma tests
	let karma9    = plyr.karma <=  -9 || factStatus[22];
	karma9    =    valDR[karma9] +  "-9 karma" +  valDRx[karma9];
	let karma18   = plyr.karma <= -18 || factStatus[23];
	karma18   =   valDR[karma18] + "-18 karma" + valDRx[karma18];
	let karma22   = plyr.karma <= -22 || factStatus[24];
	karma22   =   valDR[karma22] + "-22 karma" + valDRx[karma22];
	let karma45SD = plyr.karma <= -45;
	let karma45DA =   karma45SD       || factStatus[26];
	karma45DA = valDR[karma45DA] + "-45 karma" + valDRx[karma45DA];
	karma45SD = valDR[karma45SD|| factStatus[25]] + "-45 karma" + valDRx[karma45SD || factStatus[25]];
	let karma90   = plyr.karma <= -90 || factStatus[27];
	karma90   =   valDR[karma90] + "-90 karma" + valDRx[karma90];

	// Job tests
	const coColor = chiefOfficer || factStatus[24] ? ansi.TxtDefault : ansi.TxtRed;
	const spookColor   = !spook         ? ansi.TxtDefault : ansi.TxtRed;
	const spookColorSD = factStatus[25] ? ansi.TxtDefault : spookColor;
	const spookColorDA = factStatus[26] ? ansi.TxtDefault : spookColor;
	const spookColorTS = factStatus[27] ? ansi.TxtDefault : spookColor;
	const workMC  = jobList["MegaCorp"]						|| factStatus[12] ? ansi.TxtDefault : ansi.TxtRed;
	const repMC   = ns.getServer(megacorps[0]).backdoorInstalled ? "3" : "4";
	const workBI  = jobList["Blade Industries"]				|| factStatus[13] ? ansi.TxtDefault : ansi.TxtRed;
	const repBI   = ns.getServer(megacorps[1]).backdoorInstalled ? "3" : "4";
	const workFS  = jobList["Four Sigma"]					|| factStatus[14] ? ansi.TxtDefault : ansi.TxtRed;
	const repFS   = ns.getServer(megacorps[2]).backdoorInstalled ? "3" : "4";
	const workKGI = jobList["KuaiGong International"]		|| factStatus[15] ? ansi.TxtDefault : ansi.TxtRed;
	const repKGI  = ns.getServer(megacorps[3]).backdoorInstalled ? "3" : "4";
	const workNWO = jobList["NWO"]							|| factStatus[16] ? ansi.TxtDefault : ansi.TxtRed;
	const repNWO  = ns.getServer(megacorps[4]).backdoorInstalled ? "3" : "4";
	const workOI  = jobList["OmniTek Incorporated"]			|| factStatus[17] ? ansi.TxtDefault : ansi.TxtRed;
	const repOI   = ns.getServer(megacorps[5]).backdoorInstalled ? "3" : "4";
	const workEC  = jobList["ECorp"]						|| factStatus[18] ? ansi.TxtDefault : ansi.TxtRed;
	const repEC   = ns.getServer(megacorps[6]).backdoorInstalled ? "3" : "4";
	const workBnA = jobList["Bachman & Associates"]			|| factStatus[19] ? ansi.TxtDefault : ansi.TxtRed;
	const repBnA  = ns.getServer(megacorps[7]).backdoorInstalled ? "3" : "4";
	const workCI  = jobList["Clarke Incorporated"]			|| factStatus[20] ? ansi.TxtDefault : ansi.TxtRed;
	const repCI   = ns.getServer(megacorps[8]).backdoorInstalled ? "3" : "4";
	const workFT  = jobList["Fulcrum Technologies"]	|| factStatus[21] ? ansi.TxtDefault : ansi.TxtRed;
	const repFT   = ns.getServer(megacorps[9]).backdoorInstalled ? "3" : "4";

	// City faction tests
	const notInVS12A   = !plyr.factions.includes("Volhaven")  && !plyr.factions.includes("Sector-12") && !plyr.factions.includes("Aevum");
	const notInVICNT   = !plyr.factions.includes("Volhaven")  && !plyr.factions.includes("Ishima")
					  && !plyr.factions.includes("Chongqing") && !plyr.factions.includes("New Tokyo");
	const notInS12AICN = !plyr.factions.includes("Sector-12") && !plyr.factions.includes("Aevum")     && !plyr.factions.includes("Ishima")
					  && !plyr.factions.includes("Chongqing") && !plyr.factions.includes("New Tokyo");
	const niColorS12 = notInVICNT   || factStatus[3] ? ansi.TxtDefault : ansi.TxtRed;
	const niColorC   = notInVS12A   || factStatus[4] ? ansi.TxtDefault : ansi.TxtRed;
	const niColorNT  = notInVS12A   || factStatus[5] ? ansi.TxtDefault : ansi.TxtRed;
	const niColorI   = notInVS12A   || factStatus[6] ? ansi.TxtDefault : ansi.TxtRed;
	const niColorA   = notInVICNT   || factStatus[7] ? ansi.TxtDefault : ansi.TxtRed;
	const niColorV   = notInS12AICN || factStatus[8] ? ansi.TxtDefault : ansi.TxtRed;

	// Augs count tests; NOTE: Daedalus may require more than 30 augments in some BitNodes.  ns.getBitNodeMultipliers().DaedalusAugsRequirement gives the value, but it requires SF 5 or BitNode 5.
	const augs30 = ns.getResetInfo().ownedAugs.size >= 30;
	let augs20TC = (ns.getResetInfo().ownedAugs.size >= 20) || factStatus[28];
	let augs30D  = augs30 || factStatus[29];
	let augs30Il = augs30 || factStatus[30];
	augs20TC = valDR[augs20TC] + "20 augmentations" + valDRx[augs20TC];
	if (augs30D && !factStatus[29]) {
		augs30D  = ansi.TxtYellow + "30+ augmentations" + ansi.TxtDefault;
	} else {
		augs30D  = valDR[augs30D] + "30+ augmentations" + valDRx[augs30D];
	}
	augs30Il = valDR[augs30Il] + "30 augmentations" + valDRx[augs30Il];

	ns.tprint("\n",
		"| " + ansi.TxtWhite + "Done" + ansi.TxtDefault + " | " + ansi.TxtWhite + "##" + ansi.TxtDefault + " | " + ansi.TxtWhite
		 + "Faction Name:" + ansi.TxtDefault + "          | " + ansi.TxtWhite + "Requirements:" + ansi.TxtDefault + "\n",
		ansi.TxtYellow + "Early-game factions:" + ansi.TxtDefault + " |\n",
		"| " +  doneStatus[0] + " | 01 | CyberSec               | " + CSEC + "\n",
		"| " +  doneStatus[1] + " | 02 | Tian Di Hui            | " + m1TDH  + ", " + h50 + ", " + inlocCNI + "\n",
		"| " +  doneStatus[2] + " | 03 | Netburners             | " + h80    + ", Hacknet totals: " + hnLvls + ", " + hnRAM + ", " + hnCores + "\n",
		+ ansi.TxtYellow + "City factions:" + ansi.TxtDefault + " |\n",
		"| " +  doneStatus[3] + " | 04 | Sector-12              | " + m15S12 + ", " + inlocS12 + ", " + niColorS12
		 + "Not in faction Volhaven, Ishima, Chongqing, or New Tokyo\n" + ansi.TxtDefault,
		"| " +  doneStatus[4] + " | 05 | Chongqing              | " + m20C   + ", " +  inlocCh + ", " + niColorC
		 + "Not in faction Volhaven, Sector-12, or Aevum\n" + ansi.TxtDefault,
		"| " +  doneStatus[5] + " | 06 | New Tokyo              | " + m20NT  + ", " +  inlocNT + ", " + niColorNT
		 + "Not in faction Volhaven, Sector-12, or Aevum\n" + ansi.TxtDefault,
		"| " +  doneStatus[6] + " | 07 | Ishima                 | " + m30    + ", " +  inlocIs + ", " + niColorI
		 + "   Not in faction Volhaven, Sector-12, or Aevum\n" + ansi.TxtDefault,
		"| " +  doneStatus[7] + " | 08 | Aevum                  | " + m40    + ", " +  inlocAv + ", " + niColorA
		 + "    Not in faction Volhaven, Ishima, Chongqing, or New Tokyo\n" + ansi.TxtDefault,
		"| " +  doneStatus[8] + " | 09 | Volhaven               | " + m50    + ", " +  inlocVl + ", " + niColorV
		 + " Not in any other city faction\n" + ansi.TxtDefault,
		ansi.TxtYellow + "Hacker groups:" + ansi.TxtDefault + " |\n",
		"| " +  doneStatus[9] + " | 10 | NiteSec                | " +  avmnite02h + ",  " +  ram32 + "\n",
		"| " + doneStatus[10] + " | 11 | The Black Hand         | " +    IIII + ",      " +  ram64 + "\n",
		"| " + doneStatus[11] + " | 12 | BitRunners             | " + run4theh111z + ", " + ram128 + "\n",
		ansi.TxtYellow + "Megacorporations:" + ansi.TxtDefault + " |  " + ansi.TxtBlue
		 + "     (Note: Megacorporations require 100k less rep if their server is backdoored.)\n" + ansi.TxtDefault,
		"| " + doneStatus[12] + " | 13 | MegaCorp               | " + workMC + "Work for MegaCorp" + ansi.TxtDefault + "," + " ".repeat(15)
		 + ansi.TxtYellow + repMC  + "00k reputation\n" + ansi.TxtDefault,
		"| " + doneStatus[13] + " | 14 | Blade Industries       | " + workBI + "Work for Blade Industries" + ansi.TxtDefault + "," + " ".repeat(7)
		 + ansi.TxtYellow + repBI  + "00k reputation\n" + ansi.TxtDefault,
		"| " + doneStatus[14] + " | 15 | Four Sigma             | " + workFS + "Work for Four Sigma" + ansi.TxtDefault + "," + " ".repeat(13)
		 + ansi.TxtYellow + repFS  + "00k reputation\n" + ansi.TxtDefault,
		"| " + doneStatus[15] + " | 16 | KuaiGong International | " + workKGI + "Work for KuaiGong International" + ansi.TxtDefault + ", "
		 + ansi.TxtYellow + repKGI + "00k reputation\n" + ansi.TxtDefault,
		"| " + doneStatus[16] + " | 17 | NWO                    | " + workNWO + "Work for NWO" + ansi.TxtDefault + "," + " ".repeat(20)
		 + ansi.TxtYellow + repNWO + "00k reputation\n" + ansi.TxtDefault,
		"| " + doneStatus[17] + " | 18 | OmniTek Incorporated   | " + workOI + "Work for OmniTek Incorporated" + ansi.TxtDefault + "," + " ".repeat(3)
		 + ansi.TxtYellow + repOI  + "00k reputation\n" + ansi.TxtDefault,
		"| " + doneStatus[18] + " | 19 | ECorp                  | " + workEC + "Work for ECorp" + ansi.TxtDefault + "," + " ".repeat(18)
		 + ansi.TxtYellow + repEC  + "00k reputation\n" + ansi.TxtDefault,
		"| " + doneStatus[19] + " | 20 | Bachman & Associates   | " + workBnA + "Work for Bachman & Associates" + ansi.TxtDefault + "," + " ".repeat(3)
		 + ansi.TxtYellow + repBnA + "00k reputation\n" + ansi.TxtDefault,
		"| " + doneStatus[20] + " | 21 | Clarke Incorporated    | " + workCI + "Work for Clarke Incorporated" + ansi.TxtDefault + "," + " ".repeat(4)
		 + ansi.TxtYellow + repCI  + "00k reputation\n" + ansi.TxtDefault,
		"| " + doneStatus[21] + " | 22 | Fulcrum Technologies   | " + workFT + "Work for Fulcrum Technologies" + ansi.TxtDefault + "," + " ".repeat(3)
		 + ansi.TxtYellow + repFT  + "00k reputation" + ansi.TxtDefault + ", " + fulcrumassets + "\n",
		ansi.TxtYellow + "Gangs:" + ansi.TxtDefault + " |\n",
		"| " + doneStatus[22] + " | 23 | Slum Snakes            | " +   minCS30 + ",                                           " +  m1SS
		 + ",       " + karma9 + "\n",
		"| " + doneStatus[23] + " | 24 | Tetrads                | " +   minCS75 + ",              " +   inlocCNIT + ", " + karma18 + "\n",
		"| " + doneStatus[24] + " | 25 | Silhouette             | " + coColor + "CTO, CFO, or CEO at any company" + ansi.TxtDefault
		 + ",                               " + m15S + ",      " + karma22 + "\n",
		"| " + doneStatus[25] + " | 26 | Speakers for the Dead  | " +  minCS300SD + ", " + h100 + ",                      "    + kills30
		 + ", " +   karma45SD + ", " + spookColorSD + "NOT working for CIA or NSA\n" + ansi.TxtDefault,
		"| " + doneStatus[26] + " | 27 | The Dark Army          | " + minCS300DA + ", " + h300 + ", " +  inlocChDA + ",      " + kills5
		 + ", " +   karma45DA + ", " + spookColorDA + "NOT working for CIA or NSA\n" + ansi.TxtDefault,
		"| " + doneStatus[27] + " | 28 | The Syndicate          | " +   minCS200 + ", " + h200 + ", " +  inlocSAS + ",   " + m10
		 + ",      " + karma90 + ansi.TxtDefault + ", " + spookColorTS + "NOT working for CIA or NSA\n" + ansi.TxtDefault,
		ansi.TxtYellow + "Endgame factions:" + ansi.TxtDefault + " |                     " + ansi.TxtBlue
		 + "(Current number of people killed: " + sizeTextLeading(plyr.numPeopleKilled, 3) + "; karma: "
		 + sizeTextLeading(ns.formatNumber(plyr.karma, 3), 11) + ")\n" + ansi.TxtDefault,
		"| " + doneStatus[28] + " | 29 | The Covenant           |  " + b75 + ", " + augs20TC + ",  " +  h850 + ",   " +   minCS850 + "\n",
		"| " + doneStatus[29] + " | 30 | Daedalus               | " + b100 + ", " + augs30D   + ", " + h2500 + " or " +  minCS1500 + "\n",
		"| " + doneStatus[30] + " | 31 | Illuminati             | " + b150 + ", " + augs30Il + ",  " + h1500 + ",   " +  minCS1200 + "\n",
		ansi.TxtBlue + " (Note: Daedalus may require more than 30 augmentations in some BitNodes.)");
}