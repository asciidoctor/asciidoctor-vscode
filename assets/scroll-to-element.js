
function ScrollToLine(line) {
  var selectors = ['div[class^="data-line-"]', 'div[class*=" data-line-"]'];
  var data_lines = document.querySelectorAll(selectors);
  var line = parseInt(line) + 1;
  var last_element = null;
  var top_element = null;
  for (i = 0; i < data_lines.length; ++i) {
    var element = data_lines[i]
    if (typeof element.className === "undefined")
      continue;
    var num = element.className.split(' ').pop().match(/data-line-(\d+)/)[1];
    var iNum = parseInt(num);
    if(line == iNum) {
      top_element = element;
      break;
    }
    if(iNum  > line) {
      top_element = last_element;
      break;
    }
    last_element = element;
  }
  if(top_element) {
    top_element.scrollIntoView(true);
    top_element.classList.add("active-line");
  }
}