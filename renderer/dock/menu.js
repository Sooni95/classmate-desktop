/* ===== 게이미피케이션 런처 ===== */
function gShowCfg(id){
  ['cfgPick','cfgDraw','cfgWheel','cfgPk'].forEach(c=>$(c)&&$(c).classList.remove('on'));
  ['gcPick','gcDraw','gcWheel','gcPk','gcScore','gcDice','gcLotto','gcLight','gcShade','gcSymbol','gcLadder','gcBoard'].forEach(c=>$(c)&&$(c).classList.remove('on'));
  if(id)$(id).classList.add('on');
}
$('gcPick').addEventListener('click',()=>{gShowCfg('gcPick');$('cfgPick').classList.add('on');});
$('gcDraw').addEventListener('click',()=>{gShowCfg('gcDraw');$('cfgDraw').classList.add('on');});
$('gcWheel').addEventListener('click',()=>{gShowCfg('gcWheel');$('cfgWheel').classList.add('on');});
$('gcPk').addEventListener('click',()=>{gShowCfg('gcPk');$('cfgPk').classList.add('on');});
$('gcScore').addEventListener('click',()=>{gShowCfg();openWidget('scoreW');});
$('gcDice').addEventListener('click',()=>{gShowCfg();openWidget('diceW');});
$('gcLight').addEventListener('click',()=>{gShowCfg();openWidget('lightW');});
$('gcShade')&&$('gcShade').addEventListener('click',()=>{gShowCfg();openShade();});
$('gcSymbol')&&$('gcSymbol').addEventListener('click',()=>{gShowCfg();openWidget('symbolW');});
$('gcSeats')&&$('gcSeats').addEventListener('click',()=>{ipc.openExternal('https://ksk0903.github.io/table_setting/');toast('🪑 자리 배치를 브라우저에서 열었어요');});
$('gcPdf')&&$('gcPdf').addEventListener('click',()=>{ipc.openExternal('https://ksk0903.github.io/pdf_editor/');toast('📄 PDF 편집을 브라우저에서 열었어요');});
$('gcLadder').addEventListener('click',()=>{gShowCfg();if(window.openLadder)window.openLadder();});

