const vm = require('vm');

function decodeClipDown(statusOkResponse) {
    const data = statusOkResponse.data;

    // Extract the lookup array
    const arrayMatch = data.match(/var (_0x[a-f0-9]+)=\[([^\]]+)\]/);
    if (!arrayMatch) throw new Error('Could not find lookup array');
    const arrayName = arrayMatch[1];
    const arrayValues = JSON.parse('[' + arrayMatch[2] + ']');

    // Extract the base conversion function
    // Sometimes it's _0xe6c, sometimes _0xe46c, etc.
    const funcMatch = data.match(/function (_0x[a-f0-9]+)\(d,e,f\){([\s\S]+?)}eval/);
    if (!funcMatch) throw new Error('Could not find conversion function');
    const funcName = funcMatch[1];
    const funcBody = funcMatch[2];

    // Extract the packer call arguments
    const packerMatch = data.match(/eval\(function\(h,u,n,t,e,r\){[\s\S]+?}\(([^)]+)\)\)/);
    if (!packerMatch) throw new Error('Could not find packer call');
    const packerArgsStr = packerMatch[1];

    // Create a script that returns the result
    const script = `
        var ${arrayName} = ${JSON.stringify(arrayValues)};
        function ${funcName}(d,e,f){${funcBody}}
        const result = (function(h,u,n,t,e,r){
            r="";
            for(var i=0,len=h.length;i<len;i++){
                var s="";
                while(h[i]!==n[e]){s+=h[i];i++}
                for(var j=0;j<n.length;j++)s=s.replace(new RegExp(n[j],"g"),j);
                r+=String.fromCharCode(${funcName}(s,e,10)-t)
            }
            return decodeURIComponent(r)
        })(${packerArgsStr});
        result;
    `;

    return vm.runInNewContext(script, {
        Math,
        String,
        decodeURIComponent,
        RegExp,
        console,
    });
}

// Data from the previous curl
const sample = {
    status: 'ok',
    p: 'instagram',
    v: 'v2',
    data: 'var _0xc41e=["","split","0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ+/","slice","indexOf","","",".","pow","reduce","reverse","0"];function _0xe46c(d,e,f){var g=_0xc41e[2][_0xc41e[1]](_0xc41e[0]);var h=g[_0xc41e[3]](0,e);var i=g[_0xc41e[3]](0,f);var j=d[_0xc41e[1]](_0xc41e[0])[_0xc41e[10]]()[_0xc41e[9]](function(a,b,c){if(h[_0xc41e[4]](b)!==-1)return a+=h[_0xc41e[4]](b)*(Math[_0xc41e[8]](e,c))},0);var k=_0xc41e[0];while(j>0){k=i[j%f]+k;j=(j-(j%f))/f}return k||_0xc41e[11]}eval(function(h,u,n,t,e,r){r="";for(var i=0,len=h.length;i<len;i++){var s="";while(h[i]!==n[e]){s+=h[i];i++}for(var j=0;j<n.length;j++)s=s.replace(new RegExp(n[j],"g"),j);r+=String.fromCharCode(_0xe46c(s,e,10)-t)}return decodeURIComponent(r)}("bbbiibipbbibbbbpbibiibpbbiiibpbbiiibpbibibbipbbibibipbbbbbibpbbbiiibpbbibbbpbbbbibbpbbbbiiipbbbbbbipbbbibbbpbbibbibpbbiiibpbbibiipbbbibbbp... (rest of string skipped for brevity) ... bbbb",92,"ibpHZDMFC",35,2,24))',
};

// Note: I'll need to read the full data in the actual execution.
// For now, I'll just use the full string from the curl output if I can.
// But wait, the curl output was truncated in the log.
// I will rewrite the script to take the input from a file.
