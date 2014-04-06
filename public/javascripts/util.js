function formatDate(time) {
  var date = new Date(time);
  //zero-pad a single zero if needed
  var zp = function (val){
      return (val <= 9 ? '0' + val : '' + val);
  }
  //zero-pad up to two zeroes if needed
  var zp2 = function(val){
      return val <= 99? (val <=9? '00' + val : '0' + val) : ('' + val ) ;
  }
  var d = date.getDate();
  var m = date.getMonth() + 1;
  var y = date.getYear() - 100;
  var h = date.getHours();
  var min = date.getMinutes();
  var s = date.getSeconds();
  var ms = date.getMilliseconds();
  return '' + m+ '/' + d + '/' + y + ' ' + zp(h) + ':' + zp(min) + ':' + zp(s) + '.' + zp2(ms);
}

function formatBuild (build){
  if (build) return build.substring(0, 10);
}

function highlightYellow(e){
  highlight(e, 2);
}

function highlight(e, pos){
  var rgb = [255, 255, 255];

  function setBG(rgb_colors){
    e.css("background-color", "rgb("+rgb_colors[0]+","+rgb_colors[1]+","+rgb_colors[2]+")");
  }
  
  var maxHighlight = false;
  var cascade = setInterval(function(){
    if (!maxHighlight){
      if ((rgb[pos] - 25) < 100){
        rgb[pos] = 0;
        maxHighlight = true;
      } else {
        rgb[pos] = rgb[pos] - 25;
      }
    } else {
      if ((rgb[pos] + 25) > 255){
        rgb[pos] = 255;
        clearInterval(cascade);
      } else {
        rgb[pos] = rgb[pos] + 25;
      }
    }
    setBG(rgb);
  }, 40);
}

function passFail(e){
  var status = e.html().toLowerCase();
  if (status == "pass") {
    e.css("background-color", "rgb(136, 255, 136)");
  } else if (status == "fail"){
    e.css("background-color", "rgb(252, 33, 33)");
  }
}