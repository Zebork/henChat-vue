// 2018.03.02: Add support of big file (slice used)
// 2018.03.05: Cookie supported; Fix bug of slice
// 2018.03.15: Add support of progress in sending slice (HTML5 only)
// 2018.03.18: Add auto-gen mode; "control-enter" support
// 2018.04.05: End-to-end encryption realized (plain text only)
// 2018.04.06: ETE now supports attachements; add key hash comparision (MITM block)

var CLIENT_VER = '180406 - ETE plus';

var DEFAULT_SERVER = 'wss://us2.srdmobile.tk';

var SLICE_THRESHOLD = 40960;						// Data whose length(base64) over this amount will be splited
var MAX_DATALENTH = SLICE_THRESHOLD*100;			// Max data length(base64)
var MAX_TXTLENGTH = 2048;							// Max character in message
var enabledFileExts = ['.jpg', '.gif', '.png'];		// Supported file formate
var buffer = {};									// Used to receive coming slices and combine them

var ws;												// Websocket
var sToken;											// To certificate users' validation
var addrMap = {};									// {nickname: SHA-1}

var sliceQueue = [];								// Queen of data slice
var sendingSlice = ''								// The sign of sending slice
var sliceCounter = [0, 0];							// [numSent, numTotal]
var dataSlices = [];

var encryptMode = false;							// Using ETE or not
var publicKeyCache = '@';							// Public key of another user
var selfPrivateKey, selfPublicKey;					// Current user's PVK and PBK


// ===== Basic functions ====================
function rsaEncrypt(plaintext, key, enable=true) {
	if (enable) {
		var plain = base64_encode(plaintext);
		return cryptico.encrypt(plain, key).cipher;
	} else {
		return plaintext;
	}
}

function rsaDecrypt(xtext, key, enable=true) {
	if (enable) {
		var detext = cryptico.decrypt(xtext, selfPrivateKey).plaintext;
		return base64_decode(detext);
	} else {
		return xtext;
	}
}

function getCookie(key) {
	var arr, reg = new RegExp("(^| )"+key+"=([^;]*)(;|$)");
	if (arr = document.cookie.match(reg)) {
		return unescape(arr[2]);
	} else {
		return null;
	}
}

function randomStr(length, symbol=true) {
	var gen = '';
	if (symbol) {
		var charLib = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ`~!@#$%^&*()_-+=|';
	} else {
		var charLib = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
	}
	
	for (var i=0; i<length; i++) {
		index = Math.round(Math.random() * (charLib.length - 1));
		gen += charLib[index];
	}
	return gen;
}

// ==============================
// online = true: online mode
// online = false: offline mode
// ==============================
function formStatusSet(online) {
	$('#s_pvk').prop('disabled', online);
	$('#s_pbk').prop('disabled', true);
	$('#s_to').prop('disabled', !online);
	$('#s_send').prop('disabled', !online);
	$('#btn_auto').prop('disabled', online);
	$('#btn_enter').prop('disabled', online);
	$('#btn_encrypt').prop('disabled', !online);
	$('#btn_close').prop('disabled', !online);
	$('#btn_send').prop('disabled', !online);
	$('#fileSelector').prop('disabled', !online);
}
// ===========================================


// ================================================================
// Create a new websocket server, including all events:
// ws.onopen()
// ws.onmessage()
// ws.onclose()
// ws.onerror()
// ================================================================
function newSession(server) {

	// -- Connect to Web Socket
	ws = new WebSocket(server);

	// -- Set event handlers
	ws.onopen = function() {
		showMsg(`Server opened. Client ver: ${CLIENT_VER}`);
		// document.cookie = `server=${$('#s_server').val()}`;
		document.cookie = `pvk=${$('#s_pvk').val()}`;
		var now = new Date();

		// -- Send login request
		loginInfo = {
			type: 'login',
			msg: $('#s_pvk').val(),
			time: now.getTime().toString()
		}
		ws.send(JSON.stringify(loginInfo));
	};
		
	ws.onmessage = function(e) {
		// -- e.data contains received string.
		var getMsg = JSON.parse(e.data);
		// console.log(getMsg);

		// -- Server reply "login"
		if (getMsg.type === 'login') {
			sToken = getMsg.msg;
			$('#s_pbk').val(getMsg.to);
			console.log(`Server ver: ${getMsg.ver}\nGet token: [${sToken}]`);
			formStatusSet(true);
		}

		else if (getMsg.type === 'msg') {
			// -- Not a key-exchange request
			if (getMsg.key != 'true') {
				if (addrMap[getMsg.from] != undefined) {
					getMsg.from = addrMap[getMsg.from];
				}
				showMsg(getMsg, "blue");

			// -- Key-exchange request
			} else {
				// -- There is no existing public key
				if (publicKeyCache === '@') {
					showMsg(`Get public key from<br>${getMsg.from}.`, 'gray');
					publicKeyCache = getMsg.msg;
					showMsg(`!! ******** WARNING ********* !!<br>
						Please compare public keys (hash) in avoid of MITM attack.<br>
						Yours:<br>[${SHA1(selfPublicKey)}]<br>
						His/Hers:<br>[${SHA1(publicKeyCache)}]<br>
						********************************`, 'red')
					// -- Send self public key to receiver
					var now = new Date();
					var keyExchangeRequest = {
						from: $('#s_pbk').val(),
						to: [getMsg.from],
						type: 'msg',
						msg: selfPublicKey,
						key: 'true',
						token: sToken,
						time: now.getTime().toString()
					}
					ws.send(JSON.stringify(keyExchangeRequest));
					encryptMode = true;

					$('#s_to').val(getMsg.from);
					$('#s_to').prop('disabled', true);
					$('#btn_encrypt').prop('disabled', true);
					// $('#fileSelector').prop('disabled', true);

					showMsg('🔒You have entered encrypt mode.', 'red');
					document.title='🔒henChat';
				}
			}
		}

		// -- Server info
		else if (getMsg.type === 'info') {
			if (getMsg.msg != '0 reciver(s) offline.') {
				showMsg(`${getMsg.msg}`, 'gray');
			}
		}

		// -- Server error info
		else if (getMsg.type === 'err') {
			alert(`ERROR from server: ${getMsg.msg}`);
			ws.close();
		}

		// -- Slice message
		else if (getMsg.type === 'slice') {
			var nextSlice = sliceQueue.pop();
			$(`#${sendingSlice}`).val(++sliceCounter[0] / sliceCounter[1]);
			if (nextSlice != undefined) {
				ws.send(JSON.stringify(nextSlice));
			}
		}
	};

	ws.onclose = function() {
		showMsg("Server closed.");
		formStatusSet(false);
		encryptMode = false;
		publicKeyCache = '@';
	};

	ws.onerror = function(e) {
		showMsg("Server error.", "red");
		formStatusSet(false);
	};
}


// ================================================================
// Output something in log region. There are 2 typical situations:
// 1. msg is plain text: text will be shown directly;
// 2. msg is json object: text will be handled first.
// And encrypt mode status can influence the handling process.
// ================================================================
function showMsg(msg, color="black") {
	// msg here is in struct of json

	// ===============================
	// Search "XSS attack" for detail
	// ===============================
	function xssAvoid(rawStr){
		return rawStr.replace(/</g, '&lt').replace(/>/g, '&gt');
	}

	var log = $('#log');
	var notice = true;

	if (typeof(msg) === 'object') {
		var now = new Date(parseInt(msg.time));

		// -- Not in encrypt mode or the message is from the user
		if (encryptMode === false || color === 'green') {
			var strHead = `${now.toString()}<br>[${msg.from}]<br>`;
			showText = `${strHead}<font color="${color}">${xssAvoid(msg.msg).split('\n').join('<br>')}</font><br>`;
		
		// -- In encrypt mode
		} else {
			var strHead = `${now.toString()}<br>[🔒${msg.from}]<br>`;
			showText = `${strHead}<font color="${color}">${xssAvoid(rsaDecrypt(msg.msg, selfPrivateKey)).split('\n').join('<br>')}</font><br>`;
		}

		// -- Message with image
		if (msg['img'] != undefined) {

			// -- Whole file (without spliting)
			if (msg['rest'] === undefined) {

				if (encryptMode === false || color === 'green') {
					showText += `<img src="${msg.img}"><br>`;
				} else {
					showText += `<img src="${rsaDecrypt(msg.img, selfPrivateKey, true)}"><br>`;
				}
				showText += '<br>';
				log.prepend(showText);

			// -- Sliced file
			} else {

				if (buffer[msg.sign] == undefined) {
					showMsg(`Receiving an image from<br>${msg.from}<br><progress id="${msg.sign}" value="${msg.size[0]/msg.size[1]}">0%</progress>`, 'gray');
					buffer[msg.sign] = rsaDecrypt(msg.img, selfPrivateKey, encryptMode);
				} else {
					buffer[msg.sign] += rsaDecrypt(msg.img, selfPrivateKey, encryptMode);
					$(`#${msg.sign}`).val(msg.size[0]/msg.size[1]);
					notice = false;
				}

				// -- Transfer finished
				if (msg['rest'] <= 0) {
					showText += `<img src="${buffer[msg.sign]}" width="400"><br>`;
					showText += '<br>';
					log.prepend(showText);
					delete(buffer[msg.sign]);					// Clean buffer
				}
			}

		// -- Text message
		} else {
			showText += '<br>';
			log.prepend(showText);
		}

		// -- Show the notification
		if(document.hidden && Notification.permission === "granted" && notice) {
			var notification = new Notification('henChat', {
				body: 'New message comes!',
			});

			notification.onclick = function() {
				window.focus();
			};
		}

	// -- msg is plain text
	} else {
		log.prepend(`<font color="${color}">${msg}<br><br></font>`);
	}
}


// ================================================================
// Check the extension of selected file. Available extensions are 
// defined on the head
// ================================================================
function fileExtCheck(fileInputLable, extNames) {
			
	var fname = fileInputLable.value;
	if (!fname) {
		return false
	}
	var fext = fname.slice(-4).toLowerCase();
	if (extNames.indexOf(fext) != -1) {
		return true;
	} else {
		return false;
	}
}

// ===== Init ======================================
formStatusSet(false);

// $('#s_server').val(getCookie('server'));
$('#s_pvk').val(getCookie('pvk'));

var fileSelector = document.getElementById('fileSelector');
// =================================================


// ===== Button Events =============================

// -- Click "New ID"
$('#btn_auto').click(function () {

	$('#s_pvk').val(randomStr(64));
	showMsg('A new key will be generated. Please save it by yourself.', 'gray');
	$('#btn_enter').click();
});


// -- Click "Login"
$('#btn_enter').click(function () {

	// -- Check if pvk's formate is correct
	if ($('#s_pvk').val().length === 64) {

		// -- Keygen
		[selfPrivateKey, selfPublicKey] = (function() {
			var selfRSA = cryptico.generateRSAKey($('#s_pvk').val(), 1024);		// And it would also be used to decrypt
			return [selfRSA, cryptico.publicKeyString(selfRSA)];				// The later is used to encrypt plain text
		})();

		newSession(DEFAULT_SERVER);

	} else {
		alert('Invalid key.');
	}
});


// -- Click "ETE"
$('#btn_encrypt').click(function () {

	if ($('#s_to').val() === '') {
		alert('There is no receiver in the list...');
		return -1;
	}

	$('#s_to').prop('disabled', true);					// Forbid multi-receiver
	// $('#fileSelector').prop('disabled', true);		// Forbid file sender (now there is no need to do this)
	$('#btn_encrypt').prop('disabled', true);			// Forbid ETE button
	$('#btn_send').prop('disabled', true);				// Temporary block ETE button
	var receiver = $('#s_to').val().split('\n')[0];		// Fix receiver as the 1st receiver

	var now = new Date();
	var keyExchangeRequest = {
		from: $('#s_pbk').val(),
		to: [receiver],
		type: 'msg',
		msg: selfPublicKey,
		key: 'true',
		token: sToken,
		time: now.getTime().toString()
	}

	ws.send(JSON.stringify(keyExchangeRequest));
	while (publicKeyCache != '@');						// Wait for public key from receiver
	$('#btn_send').prop('disabled', false);				// Send button recovery

	encryptMode = true;
});


// -- Click "Send"
$('#btn_send').click(function () {

	var eteSign = (function () {
		if (encryptMode === true) {
			return '🔒';
		} else {
			return '';
		}
	})();

	// -- It is unacceptable to send empty message (no text, no attachement)
	if ($('#s_send').val() === '' && !fileExtCheck(fileSelector, enabledFileExts)) {
		showMsg('Cannot send empty message!', 'red');

	} else {

		// Msg infomation
		var now = new Date();
		var sendLstWithName = $('#s_to').val().split('\n');
		var sendLst = [];

		// -- Make receivers' list
		for (c of sendLstWithName) {
			if (c.indexOf('#') != -1) {					// Receiver address with nickname
				var [nickname, addr] = c.split('#');
				sendLst.push(addr);
				addrMap[addr] = nickname;
			} else {
				sendLst.push(c);
			}
		}

		// -- Attachment exist
		// -- If file is supported
		if (fileExtCheck(fileSelector, enabledFileExts)) {
					
			var reader = new FileReader();

			reader.onload = function(e) {
				var data = e.target.result;
				var fsize = fileSelector.files[0].size;

				if (data.length > MAX_DATALENTH) {
					showMsg('File size over limit!', 'red');
					return -1;
				}

				// -- Big file (size over slice threshold)
				if (data.length > SLICE_THRESHOLD) {

					var cut = function (dataStr, maxSlice) {
						var sliceNum = parseInt(dataStr.length / maxSlice);
						var slices = [];
						var p = 0;

						for (var i=0; i<sliceNum+1; i++) {
							slices.push(rsaEncrypt(dataStr.substring(p, p+maxSlice), publicKeyCache, encryptMode));
							p += maxSlice;
						}
						return slices;
					}

					dataSlices = cut(data, SLICE_THRESHOLD);
					sendingSlice = randomStr(8, false);
					sliceCounter[0] = 0;
					sliceCounter[1] = dataSlices.length
					var sentLen = 0;
					var dataLen = data.length;

					// -- Show a process graph
					showMsg(`File sending... (${dataLen})<br><progress id="${sendingSlice}" value="0">0%</progress>`, 'gray');
					console.log(`Data has been splited into ${dataSlices.length} parts.`);

					for (var i=0; i<dataSlices.length; i++) {

						sentLen += SLICE_THRESHOLD;
						var contentWithImg = {
							from: $('#s_pbk').val(),
							to: sendLst,
							type: 'msg',
							sign: sendingSlice,
							size: [i+1, dataSlices.length],		// [sent slice, total slice number]
							rest: dataLen - sentLen,
							msg: rsaEncrypt($('#s_send').val(), publicKeyCache, encryptMode),
							img: dataSlices[i],
							token: sToken,
							time: now.getTime().toString()
						}
						sliceQueue.push(contentWithImg);
					}
					sliceQueue = sliceQueue.reverse();

					// Here the client just send the 1st slice and wait the response of server.
					// (Otherwise the sever would crash.)
					// Once get the response, the next slice would be able to be sent.
					// That part is written in function "ws.onmessage()"
					ws.send(JSON.stringify(sliceQueue.pop()));

				// -- Send small file without splitting
				} else {

					var contentWithImg = {
						from: $('#s_pbk').val(),
						to: sendLst,
						type: 'msg',
						msg: rsaEncrypt($('#s_send').val(), publicKeyCache, encryptMode),
						img: rsaEncrypt(data, publicKeyCache, encryptMode),
						token: sToken,
						time: now.getTime().toString()
					}
					var contentWithImg_show = {
						from: eteSign + $('#s_pbk').val(),
						msg: $('#s_send').val(),
						img: data,
						time: now.getTime().toString()
					}	// -- Encrypted message cannot be shown directly
					showMsg(contentWithImg_show, 'green');

					ws.send(JSON.stringify(contentWithImg));
					$('#s_send').val('');
				}

				fileSelector.value = '';
			}
			reader.readAsDataURL(fileSelector.files[0]);

		// -- Plain text
		} else {

			if ($('#s_send').val().length <= MAX_TXTLENGTH) {

				// -- ETE mode
				var content = {
					from: $('#s_pbk').val(),
					to: sendLst,
					type: 'msg',
					msg: rsaEncrypt($('#s_send').val(), publicKeyCache, encryptMode),
					token: sToken,
					time: now.getTime().toString()
				}
				var content_show = {
					from: eteSign + $('#s_pbk').val(),
					msg: $('#s_send').val(),
					time: now.getTime().toString()
				}
				showMsg(content_show, 'green');

				ws.send(JSON.stringify(content));
				$('#s_send').val('');

			} else {
				showMsg(`Too many characters!(over ${MAX_TXTLENGTH})`, 'red');
			}
		}
	}
});
			 

// -- Click "Logout"
$('#btn_close').click(function () {
	ws.close();
	if (encryptMode) {
		location.reload();
	}
});


// ===== Key Events ===============================

// -- Press "Ctrl+Enter" to send
prevKey = '';
document.onkeydown = function (e) {
	if (e.key === 'Enter' && prevKey === 'Control') {
		$('#btn_send').click();
	}
	if (e.key != prevKey) {
		prevKey = e.key;
	}
}