// 작은 DOM 생성 도우미
/**
 * @param {string} tag
 * @param {{class?:string,id?:string,text?:string,html?:string,attrs?:object,on?:object,style?:object}} props
 * @param {Array<Node|string>} children
 */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  if (props.class) node.className = props.class;
  if (props.id) node.id = props.id;
  if (props.text != null) node.textContent = props.text;
  if (props.html != null) node.innerHTML = props.html; // 신뢰된 고정 문자열에만 사용
  if (props.attrs) for (const [k, v] of Object.entries(props.attrs)) node.setAttribute(k, v);
  if (props.style) Object.assign(node.style, props.style);
  if (props.on) for (const [k, fn] of Object.entries(props.on)) node.addEventListener(k, fn);
  for (const c of children) node.append(c);
  return node;
}

/** KeyJ → J, Digit1 → 1 */
export function keyLabel(code) {
  if (!code) return '?';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num${code.slice(6)}`;
  return { Space: 'Space', ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl', AltLeft: 'L-Alt', AltRight: 'R-Alt', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', BracketLeft: '[', BracketRight: ']' }[code] || code;
}
