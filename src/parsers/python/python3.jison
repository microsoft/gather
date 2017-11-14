/* Python Parser for Jison */
/* https://docs.python.org/3.4/reference/lexical_analysis.html */
/* https://docs.python.org/3.4/reference/grammar.html */

/* lexical gammar */
%{ 
    var indents = [0], 
        indent = 0, 
        dedents = 0

        // we don't need to implement a full stack here to ensure symmetry
        // because it's ensured by the grammar
        brackets_count = 0; 

    var keywords = [
        "continue", "nonlocal", "finally", "lambda", "return", "assert",
        "global", "import", "except", "raise", "break", "False", "class",
        "while", "yield", "None", "True", "from", "with", "elif", "else",
        "pass", "for", "try", "def", "and", "del", "not", "is", "as", "if",
        "or", "in"
    ]

    var includes = {};

    var unique = function( list ) {
        if ( !list ) return []
        return list.filter(function( v, i, arr ) {
            return arr.lastIndexOf( v ) == i
        })
    }

    // create a code node
    var code = function( s, type, opts ) {
        opts || ( opts = {} )
        var _code = { s: s, type: type }
        for ( var p in opts )
            _code[ p ] = opts[ p ]
        return _code
    }

    var _alloc = {};
    var allocate = function( prefix ) { // allocate a variable name
        prefix = '__pys_' + prefix
        _alloc[ prefix ] || ( _alloc[ prefix ] = 0 )
        _alloc[ prefix ] += 1
        return prefix + _alloc[ prefix ]
    }

    Array.prototype.code = function( type, delimiter, opts ) {
        opts || ( opts = {} )
        typeof delimiter == 'undefined' && ( delimiter = ';\n' )
        var vars = []
        this.s = this
            .map(function( c ) {
                if ( c.vars ) vars = vars.concat( c.vars )
                return ( typeof c.s == 'undefined' ) ? c : c.s
            })
            .filter(function( s ) { return !!( s || '').trim() })
            .join( delimiter )

        if ( type ) this.type = type
        this.vars = unique( vars )
        for ( var p in opts ) {
            this[ p ] = opts[ p ]
        }
        return this
    }

    String.prototype.replaceToken = function( token, replacement ) {
        typeof replacement.s != 'undefined' && ( replacement = replacement.s )
        // handle indentation
        // compute leading spaces before the token
        var i = this.indexOf( token )
        var n = this.lastIndexOf( '\n', i )
        var leading = this.substring( n + 1, i ) // if not found: -1 + 1 = 0

        var _replacement = replacement.toString()
        if (leading.trim().length == 0 ) { // all spaces
            _replacement = _replacement.split( '\n' ).map(function(l, i){
                return ( i == 0 ) ? l : leading + l;
            }).join( '\n' )
        }

        // dumb replacement without using string match parameters used by .replace
        
        i = this.indexOf( token )
        var s = String( this );
        if ( i != -1 ) {
            s = this.substring( 0, i ) + 
                _replacement + 
                this.substring( i + token.length )
            //s = this.replace( token, _replacement )
        }
        

        if ( s.indexOf( token ) != -1 ) {
            return s.replaceToken( token, replacement )
        } else {
            return s
        }

        return ( s.indexOf( token ) != -1 ) 
            ? s.replaceToken( token, replacement )
            : s;
    }

    String.prototype.code = function( type, defaults, alloc ) {
        defaults || ( defaults = {} )
        alloc || ( alloc = {} )
        var s = this
        return function( opts ) {
            opts || ( opts = {} )
            var _s = s;
            for ( var p in opts ) {
                _s = _s.replaceToken( '{{' + p + '}}', opts[ p ] )
            }
            for ( var p in defaults ) {
                ( opts[ p ] ) || ( opts[ p ] = defaults[ p ] )
                _s = _s.replaceToken( '{{' + p + '}}', opts[ p ] )
            }

            for ( var p in alloc ) {
                ( opts[ p ] ) || ( opts[ p ] = allocate( alloc[ p ] ) )
                _s = _s.replaceToken( '{{' + p + '}}', opts[ p ] )
            }

            if ( _s.indexOf( '{{' ) != -1 ) {
                throw new Error( "Missing params for code template: " + _s )
            }
            return code( _s, type, opts )
        }
    }

    // code blocks
    code._module = (
        '{{vars}}\n' +
        '{{code}};\n' +
        '{{exports}}\n' 
    ).code( 'module', { vars: '' } )

    code._module.exports = (
        'module.exports.{{var}}={{var}}'
    ).code( 'module.export' )

    code.module = function( opts ) {
        if ( opts.code.vars.length ) {
            opts.vars = 'var ' + opts.code.vars.join( ', ' ) + ';'
        }
        opts.exports = opts.code.vars.map(function(v) {
            return code._module.exports({ var: v })
        }).code()
        return code._module( opts )
    }

    code._list = (
        '[\n' +
        '    {{items}}\n' +
        ']'
    ).code( 'list' )

    code._list.item = (
        '{{item}}'
    ).code( 'list.item' )

    code.list = function( opts ){
        if ( !opts.items.length ) {
            return code( '[]' )
        }
        opts.items = opts.items.map(function(i) {
            return code._list.item({ item: i })
        }).code( undefined, ',\n' )
        return code._list( opts )
    }

    code._dict = (
        '{\n' +
        '    {{pairs}}\n' +
        '}' 
    ).code( 'dict' )

    code._dict.pair = (
        '{{k}}: {{v}}'
    ).code( 'dict.entry' )

    code._dictlong = (
        '[{{pairs}}].reduce(function({{memo}},{{p}}){\n' +
        '    {{memo}}[{{p}}[0]] = {{p}}[1];\n' +
        '    return {{memo}}\n' +
        '}, {})'
    ).code( 'dict' )

    code._dictlong.pair = (
        '[{{k}},{{v}}]'
    ).code( 'dict.entry' )

    code.dict = function( opts ) {
        var long = opts.pairs.some(function(pair) {
            return (!pair.k || !pair.k.match( /['"\d]/) )
        })

        var dictfn = code._dict
        if ( long ) {
            dictfn = code._dictlong
            opts.memo = allocate( 'memo' )
            opts.p = allocate( 'pair' )
        }

        opts.pairs = opts.pairs.map( function( pair ) {
            return dictfn.pair( pair )
        }).code( undefined, ',\n' )
        return dictfn( opts )
    }

    code._set = (
        '[\n' +
        '    {{items}}\n' +
        '].filter(function({{item}},{{i}},{{arr}}){\n' +
        '    return {{arr}}.lastIndexOf({{item}})=={{i}}\n' +
        '})'
    ).code( 'set' )

    code.set = function( opts ) {
        opts.items = opts.items.join( ',\n' )
        opts.item = allocate( 'item' )
        opts.i = allocate( 'i' )
        opts.arr = allocate( 'arr' )
        return code._set( opts )
    }


    code._setcomp = (
        '(function({{results}}){\n' +
        '    return {{set}}\n' +
        '})([])'
    ).code( 'set' )

    code._setcomp.for = (
        '{{source}}.forEach(function({{i}}){\n' +
        '    {{code}}\n' +
        '})'
    ).code()

    code._setcomp.if = (
        'if ({{cond}}){\n' +
        '    {{code}}\n' +
        '}\n'
    ).code()

    code.setcomp = function( opts ) {
        var current = opts.items[ 0 ]

        if ( !current ) { // we're done, create a simple set
            return code.set({
                
            })
        }

        if ( opts.target ) {
            var target = current
            var results = allocate( 'results' )

        } else {

        }
    }


    code.assert = (
        'if (!({{cond}})) {\n' + 
        '    throw new Error({{err}})\n' +
        '}'
    ).code( 'assert', { err: '"AssertionError"' } )

    code._decorate = (
        '{{func}}\n' + 
        '{{decorators}}' 
    ).code( 'decorated' )

    code._decorate.decorator = (
        '{{name}}={{decorator}}({{name}})'
    ).code( 'decorated.dectorator' )

    code.decorate = function( opts ) {
        var name = opts.func.name
        opts.decorators = opts.decorators.map(function(d) {
            d.name = name
            if ( d.args ) {
                d.decorator += '(' + d.args.join( ',' ) + ')'
            }
            return code._decorate.decorator( d )
        }).code()
        return code._decorate( opts )
    }

    code._if = (
        'if ({{cond}}){\n' +
        '    {{code}}\n' +
        '}{{elif}}{{else}}'
    ).code( 'if', { else: '', elif: '' } )

    code._if.else = (
        'else{\n' +
        '    {{code}}\n' +
        '}'
    ).code( 'if.else' )

    code._if.elif = (
        'else if({{cond}}){\n' +
        '    {{code}}\n' +
        '}'
    ).code( 'if.elif' )

    code.if = function( opts ) {
        var vars = opts.code.vars
        if ( opts.else ) {
            vars = vars.concat( opts.else.vars )
            opts.else = code._if.else({ code: opts.else })
        }

        if ( opts.elif ) {
            opts.elif = opts.elif.map(function( e ) {
                vars = vars.concat( e.code.vars )
                return code._if.elif( e )
            }).code( undefined, '' )
        }

        opts.vars = unique( vars )
        return code._if( opts )
    }

    code._while = (
        'while({{cond}}){\n' +
        '    {{code}}\n' +
        '}'
    ).code( 'while' )

    code._while.else = (
        'while(true){\n' +
        '    if(!({{cond}})){\n' +
        '        {{else}};\n' +
        '        break\n' +
        '    }\n' +
        '    {{code}}\n' +
        '}'
    ).code( 'while' )

    code.while = function( opts ) {
        opts.vars = opts.code.vars
        if ( opts.else ) {
            opts.vars = opts.vars.concat( opts.else.vars )
        }
        opts.vars = unique( opts.vars )
        return ( opts.else ) ? code._while.else( opts ) : code._while( opts );
    }

    code._for = (
        'var {{arr}}={{iter}};\n' +
        'if(!Array.isArray({{arr}})) {{arr}} = Object.keys({{arr}});\n' +
        'for(var {{i}}=0;{{i}}<{{arr}}.length;{{i}}+=1){\n' +
        '    {{target}}={{arr}}[{{i}}];\n' +
        '    {{code}}\n' +
        '}'
    ).code( 'for', {}, { 'arr': 'arr', 'i': 'i' } )

    code._for.else = (
        'var {{arr}}={{iter}};\n' +
        'if(!Array.isArray({{arr}})) {{arr}} = Object.keys({{arr}});\n' +
        'for(var {{i}}=0;{{i}}<{{arr}}.length;{{i}}+=1){\n' +
        '    {{target}}={{arr}}[{{i}}];\n' +
        '    {{code}};\n' +
        '    if({{i}}=={{arr}}.length-1){\n' +
        '        {{else}}\n' +
        '    }\n' +
        '}'
    ).code( 'for' )

    code.for = function( opts ) {
        opts.vars = opts.code.vars.concat( [ opts.target ] )
        if ( opts.else ) {
            opts.vars = opts.vars.concat( opts.else.vars )
        }
        opts.vars = unique( opts.vars )
        opts.arr = allocate( 'arr' )
        opts.i = allocate( 'i' )
        return ( opts.else ) ? code._for.else( opts ) : code._for( opts )
    }

    code._try = (
        '{{collect_exc}}\n' +
        'try{\n' +
        '    {{code}}\n' +
        '}{{excepts}}{{finally}}'
    ).code( 'try', { finally: '', excepts: '', collect_exc: '' } )

    code._try.excepts = (
        'catch({{exc}}){\n' +
        '    {{collect_exc}}\n' +
        '    {{excepts}}\n' +
        '}'
    ).code( 'try.excepts', { collect_exc: '' } )

    code._try.except = (
        '{{else}}if({{exc}} instanceof {{cond}}){\n' +
        '    {{code}}\n' +
        '}'
    ).code( 'try.except', { else: '', if: 'if' } )

    code._try.else = (
        'if(!({{else_exc}})){\n' +
        '    {{code}}\n' +
        '}'
    ).code( 'try.else' )

    code._try.finally = (
        'finally{\n' +
        '    {{code}}\n' +
        '}'
    ).code( 'try.finally' )

    code.try = function( opts ) {
        opts.exc = allocate( 'exc' )
        var else_exc = allocate( 'exc' )
        var collect_exc = ''
        var vars = []
        if ( opts.else ) {
            vars = vars.concat( opts.else.vars )
            collect_exc = else_exc + '=' + opts.exc + ';'
            opts.collect_exc = 'var ' + else_exc + ';' 
            opts.else = code._try.else({ code: opts.else, else_exc: else_exc })
            opts.finally || ( opts.finally = [] )
            opts.finally = [ opts.else ].concat( opts.finally ).code()
        }
        if ( opts.finally ) {
            vars = vars.concat( opts.finally.vars )
            opts.finally = code._try.finally({ code: opts.finally })
        }
        if ( opts.excepts ) {
            // create the default except to propagate the exception
            var has_default = opts.excepts.some(function( e ) {
                return !e.cond
            })
            if ( !has_default ) {
                var s = 'throw ' + opts.exc
                var _throw = code( s, 'raise' )
                opts.excepts.push({ code: [ _throw ].code() })
            }

            opts.excepts = code._try.excepts({
                exc: opts.exc,
                collect_exc: collect_exc,
                excepts: opts.excepts.map(function(e, i) {
                    e.exc = opts.exc
                    vars = vars.concat( e.code.vars )
                    if ( !e.cond ) {
                        if ( i != opts.excepts.length - 1 ) {
                            throw new Error( "default except clause is not last" )
                        }

                        if ( i == 0 ) return e.code
                        return (
                            'else{\n' + 
                            '    {{code}}\n' +
                            '}'
                        ).code( 'try.except' )( e )
                    }
                    e.else = ( i != 0 ) ? 'else ' : ''
                    return code._try.except(e)
                }).code( null, '' )
            })
        }
        opts.vars = unique( opts.code.vars.concat( vars ) )
        return code._try( opts )
    }

    code.raise = (
        'throw {{err}}'
    ).code( 'raise', { err: '(___pys_exc||new Error("RuntimeError"))' } )

    code.with = (
        '(function({{as}}){\n' +
        '    {{code}}\n' +
        '})({{with}})'
    ).code( 'with' )

    code.lambda = (
        'function({{args}}){return {{code}} }'
    ).code( 'lambda' )

    code._def = (
        '{{name}} = function({{params}}){\n' +
        '    {{inner_vars}}\n' +
        '    {{args}}\n' +
        '    {{defaults}}\n' +
        '    {{code}}\n' +
        '}\n' + 
        '{{anno}}'
    ).code( 'def', { defaults: '', anno: '', args: '', inner_vars: '' } )

    code._def.default = (
        '(typeof {{name}}=="undefined"&&({{name}}={{default}}))'
    ).code( 'def.default' )

    code._def.anno = (
        '{{name}}.func_annotation={{anno}};'
    ).code( 'def.anno' )

    code.def = function( opts ) {
        var vars = opts.code.vars
        if ( vars.length ) {
            opts.inner_vars = 'var ' + vars.join( ', ' ) + ';\n'
        }
        opts.vars = [ opts.name ]

        opts.defaults = opts.params
            .filter(function(p) { return !!p.default })
            .map(function(p) {
                return code._def.default({ name: p.name, default: p.default })
            }).code()

        opts.params = opts.params
            .filter(function(p, i){ 
                if ( p.args ) {
                    opts.args = 'var ' + p.name + '=arguments.slice(' + i + ');\n'
                } else return true
            }).map(function(p) {
                return p.name
            }).join( ',' )

        return code._def( opts )
    }

    code._class = (
        '{{name}} = (function(){\n' + 
        '    var {{initializing}}=false;\n' +
        '    {{inner_vars}}\n' +
        '    {{code}};\n' + 
        '    var {{cls}}=function {{name}}(){\n' +
        '       var {{instance}}=this;\n' +
        '       if ( !( this instanceof arguments.callee )) {\n' +
        '           {{initializing}}=true;\n' +
        '           {{instance}}=new arguments.callee();\n' +
        '           {{initializing}}=false;\n' +
        '       }\n' +
        '       if ( {{instance}}.__init__ && !{{initializing}} ) {\n' +
        '           {{instance}}.__init__.apply({{instance}}, arguments)\n' +
        '       }\n' +
        '       return {{instance}}\n' +
        '    }\n' +
        '    {{proto}}\n' +
        '    return {{cls}}\n' +
        '})()'
    ).code( 'class', { inner_vars: '' } )

    code._class.proto = (
        '{{cls}}.prototype.{{arg}}={{arg}}'
    ).code( 'class.prototype' )

    code._class.extend = (
        '{{cls}}.prototype = Object.create({{extend}}.prototype)'
    ).code( 'class.prototype' )

    code.class = function( opts ) {
        opts.initializing = allocate( "initializing" )
        opts.instance = allocate( "instance" )
        opts.cls = allocate( 'class' )
        opts.vars = [ opts.name ]
        if ( opts.code.vars.length ) {
            opts.inner_vars = 'var ' + opts.code.vars.join( ',' ) + ';'
        }

        opts.proto = opts.code.vars.map(function(v) {
            return code._class.proto({ arg: v, cls: opts.cls })
        })

        if ( opts.extends && opts.extends.length ) {
            opts.proto.unshift( code._class.extend({ 
                cls: opts.cls, 
                extend: opts.extends[ 0 ]
            }))
        }

        opts.proto.code()
        return code._class( opts )
    }

    code.var = function( opts ) {
        opts.op || ( opts.op = '=' )
        var targets = opts.targets
        var sources = opts.sources || []

        // create the source string as a single value or a list of values
        var _sources = ( sources.length == 1 )
            ? sources[ 0 ].s || sources[ 0 ]
            : '[' + sources.join( ',' ) + ']';

        // generate the list of vars defined by the statement
        var _vars = function( vars, op ) {
            if ( opts.op != '=' ) return []
            return vars.filter(function( v ) {
                return  v.indexOf( '.' ) == -1 &&
                        v.indexOf( '(' ) == -1 &&
                        v.indexOf( '[' ) == -1
            })
        }

        // always use a function to evaluate the operators
        var _op = function( a, b ) {
            var s = ( typeof opts.op == 'function' )
                ? opts.op( a, b )
                : a + opts.op + b;
            return code( s, 'var', { vars: _vars( [ a ] ) } )
        }

        // no assignment: no sources, just targets
        if ( !sources.length ) {
            var _target = targets[ 0 ][ 0 ]
            var vars = [ _target ]
            if ( _target.s ) {
                vars = []
                _target = _target.s
            }
            return [ code( _target, 'var', { vars: [] } ) ].code()
        } 

        // simple assignment: x = y = z
        if ( targets.every(function( t ) { return t.length == 1 } ) ) {
            var _targets = targets.map( function( t ) { 
                return t[ 0 ]
            })

            return [ _op( _targets.join( '=' ), _sources ) ].code()
        }

        // otherwise, we have multiple target variables so we'll need to unpack
        // the values out of the source array
        var s = [], vars = {}

        // assign the last groups of targets, before the first ones
        for ( var t = targets.length - 1 ; t >= 0 ; t -= 1 ) {
            var _targets = targets[ t ]

            // there's only one target - we can assign it to the original source
            if ( _targets.length == 1 ) {
                vars[ _targets[ 0 ] ] = 1
                s.push( _op( _targets[ 0 ], _sources ) )
                _sources = _targets[ 0 ] // the new sources is this variable
                continue;
            }

            // otherwise, there's more than one target, unpack it after ensuring
            // that it's not a function that will be evaluated more than once
            if ( !unpack_var ) {
                var unpack_var = allocate( 'unpack' )
                s.push( 'var ' + unpack_var + '=' + _sources )
                _sources = unpack_var
            }

            _targets.forEach(function(t, i) {
                vars[ t ] = 1
                s.push( _op( t, _sources + '[' + i + ']' ) )
            })
        }

        return s.code()
    };

    code._import = (
        '{{name}}=require("{{path}}")'
    ).code( 'import' )

    code.import = function( opts ) {
        if ( !opts.imports ) {
            opts.imports = Array.isArray( opts ) ? opts : [ opts ]
        }
        var vars = {}
        return opts.imports.map(function( i ) {
            var path = i.path.split( '.' )
            var name = i.name
            if ( !name ) {
                var name = '', out;
                name = path.map(function( n, i ) {
                    name += n
                    if ( i == path.length - 1 ) return ''
                    out = '(' + name + '||(' + name + '={});\n'
                    name += '.'
                    return out
                }).join( '' ) + name
            }

            vars[ name ] = 1
            if ( opts.base ) {
                var up = opts.base.match( /^\.*/ )[ 0 ]
                path = opts.base.substr( up.length )
                    .split( '.' )
                    .concat( path )

                var base = ( up.length % 2 ) ? [ '.' ] : []
                for ( var i = Math.floor( up.length / 2 ) ; i > 0 ; i -- ) {
                    base.push( '..' )
                }
                path = base.concat( path )
            }
            return code._import({ name: name, path: path.join( '/' ) })
        }).code( undefined, undefined, { vars: Object.keys( vars ) } )
    }

    var log = function() {
        console.log.apply( null, arguments )
    }

%}

%lex

uppercase               [A-Z]
lowercase               [a-z]
digit                   [0-9]

// identifiers
identifier              ({xid_start})({xid_continue})*
xid_start               ("_")|({uppercase})|({lowercase})
xid_continue            {xid_start}|{digit}

// reserved
operators               ">>="|"<<="|"**="|"//="|"->"|"+="|"-="|"*="|"/="|"%="|
                        "&="|"|="|"^="|"**"|"//"|"<<"|">>"|"<="|">="|"=="|"!="|
                        "("|")"|"["|"]"|"{"|"}"|","|":"|"."|";"|"@"|"="|"+"|"-"|
                        "*"|"/"|"%"|"&"|"|"|"^"|"~"|"<"|">"|"""|"#"|"\"

// strings
longstring              {longstring_double}|{longstring_single}
longstring_double       '"""'{longstringitem}*'"""'
longstring_single       "'''"{longstringitem}*"'''"
longstringitem          {longstringchar}|{escapeseq}
longstringchar          [^\\]

shortstring             {shortstring_double}|{shortstring_single}
shortstring_double      '"'{shortstringitem_double}*'"'
shortstring_single      "'"{shortstringitem_single}*"'"
shortstringitem_double  {shortstringchar_double}|{escapeseq}
shortstringitem_single  {shortstringchar_single}|{escapeseq}
shortstringchar_single  [^\\\n\']
shortstringchar_double  [^\\\n\"]
escapeseq               \\.

// numbers
integer                 ({decinteger})|({hexinteger})|({octinteger})
decinteger              (([1-9]{digit}*)|"0")
hexinteger              "0"[x|X]{hexdigit}+
octinteger              "0"[o|O]{octdigit}+
bininteger              "0"[b|B]{bindigit}+
hexdigit                {digit}|[a-fA-F]
octdigit                [0-7]
bindigit                [0|1]

floatnumber             {exponentfloat}|{pointfloat}
exponentfloat           ({digit}+|{pointfloat}){exponent}
pointfloat              ({digit}*{fraction})|({digit}+".")
fraction                "."{digit}+
exponent                [e|E][\+|\-]({digit})+

%s INITIAL DEDENTS INLINE

%%

<INITIAL,INLINE><<EOF>> %{ 
                            // if the last statement in indented, need to force a dedent before EOF
                            if (indents.length > 1) { 
                               this.begin( 'DEDENTS' ); 
                               this.unput(' '); // make sure EOF is not triggered 
                               dedents = 1; 
                               indents.pop();
                            } else { 
                                return 'EOF'; 
                            } 
                        %}
<INITIAL>\              %{ indent += 1 %}
<INITIAL>\t             %{ indent = ( indent + 8 ) & -7 %}
<INITIAL>\n             %{ indent = 0 %} // blank line
<INITIAL>\#[^\n]*       /* skip comments */
<INITIAL>.              %{ 
                            this.unput( yytext )
                            var last = indents[ indents.length - 1 ]
                            if ( indent > last ) {
                                this.begin( 'INLINE' )
                                indents.push( indent )
                                return 'INDENT'
                            } else if ( indent < last ) {
                                this.begin( 'DEDENTS' )
                                dedents = 0 // how many dedents occured
                                while( indents.length ) {
                                    dedents += 1
                                    indents.pop()
                                    last = indents[ indents.length - 1 ]
                                    if ( last == indent ) break
                                }
                                if ( !indents.length ) {
                                    throw new Error( "TabError: Inconsistent" )
                                }
                            } else {
                                this.begin( 'INLINE' )
                            }
                        %}
<DEDENTS>.              %{
                            this.unput( yytext )
                            if ( dedents-- > 0 ) {
                                return 'DEDENT'
                            } else {
                                this.begin( 'INLINE' )
                            }
                        %}

<INLINE>\n              %{
                            // implicit line joining
                            if ( brackets_count <= 0 ) {
                                indent = 0; 
                                this.begin( 'INITIAL' )
                                return 'NEWLINE'
                            }
                        %}

<INLINE>\#[^\n]*        /* skip comments */
<INLINE>[\ \t\f]+       /* skip whitespace, separate tokens */
<INLINE>{operators}     %{
                            if ( yytext == '{' || yytext == '[' || yytext == '(' ) {
                                brackets_count += 1
                            } else if ( yytext == '}' || yytext == ']' || yytext == ')' ) {
                                brackets_count -= 1
                            }
                            return yytext 
                        %}
<INLINE>{floatnumber}   return 'NUMBER'
<INLINE>{bininteger}    %{  
                            var i = yytext.substr(2); // binary val
                            yytext = 'parseInt("'+i+'",2)'
                            return 'NUMBER'
                        %}
<INLINE>{integer}       return 'NUMBER'
<INLINE>{longstring}    %{
                            // escape string and convert to double quotes
                            // http://stackoverflow.com/questions/770523/escaping-strings-in-javascript
                            var str = yytext.substr(3, yytext.length-6)
                                .replace( /[\\"']/g, '\\$&' )
                                .replace(/\u0000/g, '\\0');
                            yytext = '"' + str + '"'
                            return 'STRING'
                        %}
<INLINE>{shortstring}   %{ return 'STRING' %}
<INLINE>{identifier}    %{
                            return ( keywords.indexOf( yytext ) == -1 )
                                ? 'NAME'
                                : yytext;
                        %}

/lex

%start expressions

%%


/** grammar **/
expressions
    : file_input        { console.log( $1 ) }
    ;

// file_input: (NEWLINE | stmt)* ENDMARKER
file_input
    : EOF
    | file_input0 EOF    { $$ = code.module({ code: $1 }).s }
    ;

file_input0
    : NEWLINE
    | stmt
    | NEWLINE file_input0
        { $$ = $2 }
    | stmt file_input0
        { $$ = [ $1 ].concat( $2 ).code() }
    ;

// decorator: '@' dotted_name [ '(' [arglist] ')' ] NEWLINE
decorator
    : '@' dotted_name NEWLINE
        { $$ = { decorator: $2 } }
    | '@' dotted_name '(' ')' NEWLINE
        { $$ = { decorator: $2 + '()' } }
    | '@' dotted_name '(' arglist ')' NEWLINE
        { $$ = { decorator: $2, args: $4 } }
    ;

// decorators: decorator+
decorators
    : decorator
        { $$ = [ $1 ] }
    | decorator decorators
        { $$ = [ $1 ].concat( $2 ) }
    ;

// decorated: decorators (classdef | funcdef)
decorated
    : decorators classdef
    | decorators funcdef
        { $$ = code.decorate({ decorators: $1, func: $2 }) }
    ;

// funcdef: 'def' NAME parameters ['->' test] ':' suite
funcdef
    : 'def' NAME parameters ':' suite
        { $$ = code.def({ name: $2, params: $3, code: $5 }) }
    | 'def' NAME parameters '->' test ':' suite
    ;

// parameters: '(' [typedargslist] ')'
parameters
    : '(' ')'
        { $$ = [] }
    | '(' typedargslist ')'
        { $$ = $2 }
    ;

// typedargslist: (tfpdef ['=' test] (',' tfpdef ['=' test])* [','
//  ['*' [tfpdef] (',' tfpdef ['=' test])* [',' '**' tfpdef] | '**' tfpdef]]
//   |  '*' [tfpdef] (',' tfpdef ['=' test])* [',' '**' tfpdef] | '**' tfpdef)
// todo: *args and **kargs aren't currently implemented
typedargslist
    : tfpdef
        { $$ = [ $1 ] }
    | tfpdef ',' typedargslist_tail
        { $$ = [ $1 ].concat( $3 ) }
    | tfpdef typedargslist0
        { $$ = [ $1 ].concat( $2 ) }
    | tfpdef '=' test
        { $1.default = $3; $$ = [ $1 ] }
    | tfpdef '=' test typedargslist0
        { $1.default = $3; $$ = [ $1 ].concat( $4 ) }
    ;

typedargslist_tail
    : '*' tfpdef
        { $2.args = true; $$ = [ $2 ] }
    | '*' tfpdef typedargslist0
        { $2.args = true; $$ = [ $2 ].concat( $3 ) }
    //| '**' tfpdef // todo: implement
    //    { $2.kargs = true; $$ = [ $2 ] }
    //| '*' tfpdef ',' '**' tfpdef
    //| '*' tfpdef typedargslist0 ',' '**' tfpdef
    ;

typedargslist0
    : ',' tfpdef
        { $$ = [ $2 ] }
    | ',' tfpdef typedargslist0
        { $$ = [ $2 ].concat( $3 ) }
    | ',' tfpdef '=' test
        { $2.default = $4; $$ = [ $2 ] }
    | ',' tfpdef '=' test typedargslist0
        { $2.default = $4; $$ = [ $2 ].concat( $5 ) }
    ;

// tfpdef: NAME [':' test]
tfpdef
    : NAME
        { $$ = { name: $1 } }
    | NAME ':' test
        { $$ = { name: $1, anno: $3 } }
    ;

// varargslist: (vfpdef ['=' test] (',' vfpdef ['=' test])* [','
//   ['*' [vfpdef] (',' vfpdef ['=' test])* [',' '**' vfpdef] | '**' vfpdef]]
//   |  '*' [vfpdef] (',' vfpdef ['=' test])* [',' '**' vfpdef] | '**' vfpdef)
varargslist
    : vfpdef
        { $$ = [ $1 ] }
    | vfpdef ','
        { $$ = [ $1 ] }
    | vfpdef varargslist0
        { $$ = [ $1 ].concat( $2 ) }
    | vfpdef '=' test
        { $$ = [ $1 ] }
    | vfpdef '=' test ','
        { $$ = [ $1 ] }
    | vfpdef '=' test varargslist0
        { $$ = [ $1 ].concat( $4 ) }
    ;

varargslist0
    : ',' vfpdef
        { $$ = [ $2 ] }
    | ',' vfpdef ','
        { $$ = [ $2 ] }
    | ',' vfpdef varargslist0
        { $$ = [ $2 ].concat( $3 ) }
    | ',' vfpdef '=' test
        { $$ = [ $2 ] }
    | ',' vfpdef '=' test ','
        { $$ = [ $2 ] }
    | ',' vfpdef '=' test varargslist0
        { $$ = [ $2 ].concat( $5 ) }
    ;

// vfpdef: NAME
vfpdef: NAME;

// stmt: simple_stmt | compound_stmt
stmt: simple_stmt | compound_stmt;

// simple_stmt: small_stmt (';' small_stmt)* [';'] NEWLINE
simple_stmt
    : small_stmt NEWLINE
    | small_stmt ';' NEWLINE
    | small_stmt simple_stmt0 NEWLINE
        { $$ = [ $1 ].concat( $2 ).code() }
    ;

simple_stmt0
    : ';' small_stmt
        { $$ = [ $2 ] }
    | ';' small_stmt ';'
        { $$ = [ $2 ] }
    | ';' small_stmt simple_stmt0
        { $$ = [ $2 ].concat( $3 ) }
    ;

// small_stmt: (expr_stmt | del_stmt | pass_stmt | flow_stmt |
//              import_stmt | global_stmt | nonlocal_stmt | assert_stmt)
small_stmt: expr_stmt | del_stmt | pass_stmt | flow_stmt | import_stmt |
            global_stmt | nonlocal_stmt | assert_stmt;

// expr_stmt: testlist_star_expr (augassign (yield_expr|testlist) |
//  ('=' (yield_expr|testlist_star_expr))*)
expr_stmt
    : testlist_star_expr
        { $$ = code.var({ targets: [ $1 ] }) }
    | testlist_star_expr expr_stmt0
        { 
            $$ = code.var({ 
                targets: [ $1 ].concat( $2.targets ), 
                sources: $2.sources 
            }) 
        }
    | testlist_star_expr augassign yield_expr
    | testlist_star_expr augassign testlist
        { $$ = code.var({ targets: [ $1 ], sources: $3, op: $2 }) }
    ;

expr_stmt0
    : '=' yield_expr
    | '=' yield_expr expr_stmt0
    | '=' testlist_star_expr
        { $$ = { targets: [], sources: $2 } }
    | '=' testlist_star_expr expr_stmt0
        { 
            $$ = { 
                targets: [ $2 ].concat( $3.targets ), 
                sources: $3.sources 
            } 
        }
    ;

// testlist_star_expr: (test|star_expr) (',' (test|star_expr))* [',']
testlist_star_expr
    : test
        { $$ = [ $1 ] }
    | test ','
        { $$ = [ $1 ] }
    | test testlist_star_expr0
        { $$ = [ $1 ].concat( $2 ) }
    | star_expr
        { $$ = [ $1 ] }
    | star_expr ','
        { $$ = [ $1 ] }
    | star_expr testlist_star_expr0
        { $$ = [ $1 ].concat( $2 ) }
    ;

testlist_star_expr0
    : ',' test
        { $$ = [ $2 ] }
    | ',' test ','
        { $$ = [ $2 ] }
    | ',' test testlist_star_expr0
        { $$ = [ $2 ].concat( $3 ) }
    | ',' star_expr
        { $$ = [ $2 ] }
    | ',' star_expr ','
        { $$ = [ $2 ] }
    | ',' star_expr testlist_star_expr0
        { $$ = [ $2 ].concat( $3 ) }
    ;

// augassign: ('+=' | '-=' | '*=' | '/=' | '%=' | '&=' | '|=' | '^=' |
//   '<<=' | '>>=' | '**=' | '//=')
augassign
    : '+='
    | '-='
    | '*='
    | '/='
    | '%='
    | '&='
    | '|='
    | '^='
    | '<<='
    | '>>='
    | '**='
        { 
            $$ = function( a, b ) { 
                return a + '=' + 'Math.pow(' + a + ',' + b + ')'
            } 
        }
    | '//='
        {
            $$ = function( a, b ) {
                return a + '=' + 'Math.floor(' + a + '/' + b + ')'
            }
        }
    ;

// del_stmt: 'del' exprlist
del_stmt
    : 'del' NAME
        { $$ = code( 'delete ' + $2, 'del', { name: $2 } ) }
    ;

// pass_stmt: 'pass'
pass_stmt
    : 'pass' 
        { $$ = code( '', 'pass' ) }
    ;

// flow_stmt: break_stmt | continue_stmt | return_stmt | raise_stmt | yield_stmt
flow_stmt: break_stmt | continue_stmt | return_stmt | raise_stmt | yield_stmt;

// break_stmt: 'break'
break_stmt
    : 'break' 
        { $$ = code( 'break', 'break' ) }
    ;

// continue_stmt: 'continue'
continue_stmt
    : 'continue'
        { $$ = code( 'continue', 'continue' ) }
    ;

// return_stmt: 'return' [testlist]
return_stmt
    : 'return'
        { $$ = code( $1, 'return' ) }
    | 'return' testlist
        { $$ = code( $1 + ' ' + $2, 'return', { value: $2 } ) }
    ;

// yield_stmt: yield_expr
yield_stmt
    : yield_expr
    ;

// raise_stmt: 'raise' [test ['from' test]]
raise_stmt
    : 'raise'
        { $$ = code.raise() }
    | 'raise' test
        { $$ = code.raise({ err: $2 }) }
    | 'raise' test 'from' test
        { 
            $2 =  '(function(){'
                + 'var ___pys_exc=' + $2 + ';'
                + '___pys_exc.__cause__=' + $4 + ';'
                + 'return ___pys_exc'
                + '})()'
            $$ = code.raise({ err: $2 })
        }
    ;

// import_stmt: import_name | import_from
import_stmt
    : import_name | import_from ;

// import_name: 'import' dotted_as_names
import_name
    : 'import' dotted_as_names
        { $$ = code.import( $2 ) }
    ;

// import_from: ('from' (('.' | '...')* dotted_name | ('.' | '...')+)
//  'import' ('*' | '(' import_as_names ')' | import_as_names))
import_from
    : 'from' dotted_name 'import' import_from_tail
        { $$ = code.import({ base: $2, imports: $4 }) }
    | 'from' import_from0 dotted_name 'import' import_from_tail
        { $$ = code.import({ base: $2 + $3, imports: $5 }) }
    | 'from' import_from0 'import' import_from_tail
    ;

// note below: the ('.' | '...') is necessary because '...' is tokenized as ELLIPSIS
import_from0
    : '.'
    | '.' import_from0
        { $$ = $1 + $2 }
    | '...'
    | '...' import_from0
        { $$ = $1 + $2 }
    ;

import_from_tail
    : '*' // todo: behavior not defined
    | '(' import_as_names ')'
        { $$ = $2 }
    | import_as_names
    ;

// import_as_name: NAME ['as' NAME]
import_as_name
    : NAME
        { $$ = { path: $1 } }
    | NAME 'as' NAME
        { $$ = { path: $1, name: $3 } }
    ;

// dotted_as_name: dotted_name ['as' NAME]
dotted_as_name
    : dotted_name
        { $$ = { path: $1 } }
    | dotted_name 'as' NAME
        { $$ = { path: $1, name: $3 } }
    ;

// import_as_names: import_as_name (',' import_as_name)* [',']
import_as_names
    : import_as_name
        { $$ = [ $1 ] }
    | import_as_name ','
        { $$ = [ $1 ] }
    | import_as_name import_as_names0
        { $$ = [ $1 ].concat( $2 ) }
    ;

import_as_names0
    : ',' import_as_name
        { $$ = [ $2 ] }
    | ',' import_as_name ','
        { $$ = [ $2 ] }
    | ',' import_as_name import_as_names0
        { $$ = [ $2 ].concat( $3 ) }
    ;

// dotted_as_names: dotted_as_name (',' dotted_as_name)*
dotted_as_names
    : dotted_as_name
        { $$ = [ $1 ] }
    | dotted_as_name dotted_as_names0
        { $$ = [ $1 ].concat( $2 ) }
    ;

dotted_as_names0
    : ',' dotted_as_name
        { $$ = [ $2 ] }
    | ',' dotted_as_name dotted_as_names0
        { $$ = [ $2 ].concat( $3 ) }
    ;

// dotted_name: NAME ('.' NAME)*
dotted_name
    : NAME
    | NAME dotted_name0
        { $$ = $1 + $2 }
    ;

dotted_name0
    : '.' NAME
        { $$ = $1 + $2 }
    | '.' NAME dotted_name0
        { $$ = $1 + $2 + $3 }
    ;

// global_stmt: 'global' NAME (',' NAME)*
// todo: behavior undefined (maybe use to avoid setting a 'var' within the scope)
global_stmt
    : 'global' NAME
    | 'global' NAME global_stmt0
    ;

global_stmt0
    : ',' NAME
    | ',' NAME global_stmt0
    ;

// nonlocal_stmt: 'nonlocal' NAME (',' NAME)*
// todo: behavior undefined (maybe use to avoid setting a 'var' within the scope)
nonlocal_stmt
    : 'nonlocal' NAME
    | 'nonlocal' NAME nonlocal_stmt0
    ;

nonlocal_stmt0
    : ',' NAME
    | ',' NAME nonlocal_stmt0
    ;

// assert_stmt: 'assert' test [',' test]
assert_stmt
    : 'assert' test
        { $$ = code.assert({ cond: $2 }) }
    | 'assert' test ',' test
        { $$ = code.assert({ cond: $2, err: $4 }) }
    ;

// compound_stmt: if_stmt | while_stmt | for_stmt | try_stmt | with_stmt |
//                funcdef | classdef | decorated
compound_stmt:  if_stmt | while_stmt | for_stmt | try_stmt | with_stmt | 
                funcdef | classdef | decorated;

// if_stmt: 'if' test ':' suite ('elif' test ':' suite)* ['else' ':' suite]
if_stmt
    : 'if' test ':' suite
        { $$ = code.if({ cond: $2, code: $4 }) }
    | 'if' test ':' suite 'else' ':' suite
        { 
            $$ = code.if({ 
                cond: $2, 
                code: $4, 
                else: $7
            })
        }
    | 'if' test ':' suite if_stmt0
        {
            $$ = code.if({
                cond: $2,
                code: $4,
                elif: $5
            })
        }
    | 'if' test ':' suite if_stmt0 'else' ':' suite
        {
            $$ = code.if({
                cond: $2,
                code: $4,
                elif: $5,
                else: $8
            })
        }
    ;

if_stmt0
    : 'elif' test ':' suite
        { $$ = [ { cond: $2, code: $4 } ] }
    | 'elif' test ':' suite if_stmt0
        { $$ = [ { cond: $2, code: $4 } ].concat( $5 ) }
    ;

// while_stmt: 'while' test ':' suite ['else' ':' suite]
while_stmt
    : 'while' test ':' suite
        { $$ = code.while({ cond: $2, code: $4 }) }
    | 'while' test ':' suite 'else' ':' suite
        { $$ = code.while({ cond: $2, code: $4, else: $7 }) }
    ;

// for_stmt: 'for' exprlist 'in' testlist ':' suite ['else' ':' suite]
for_stmt
    : 'for' exprlist 'in' testlist ':' suite
        { $$ = code.for({ target: $2, iter: $4, code: $6 }) }
    | 'for' exprlist 'in' testlist ':' suite 'else' ':' suite
        { $$ = code.for({ target: $2, iter: $4, code: $6, else: $9 }) }
    ;

// try_stmt: ('try' ':' suite
//   ((except_clause ':' suite)+
//    ['else' ':' suite]
//    ['finally' ':' suite] |
//     'finally' ':' suite))
try_stmt
    : 'try' ':' suite 'finally' ':' suite
        { $$ = code.try({ code: $3, finally: $6 }) }
    | 'try' ':' suite try_excepts
        { $$ = code.try({ code: $3, excepts: $4 }) }
    | 'try' ':' suite try_excepts 'finally' ':' suite
        { $$ = code.try({ code: $3, excepts: $4, finally: $7 }) }
    | 'try' ':' suite try_excepts 'else' ':' suite
        { $$ = code.try({ code: $3, excepts: $4, else: $7 }) }
    | 'try' ':' suite try_excepts 'else' ':' suite 'finally' ':' suite
        { $$ = code.try({ code: $3, excepts: $4, else: $7, finally: $10 }) }
    ;

try_excepts
    : except_clause ':' suite
        { $1.code = $3; $$ = [ $1 ] }
    | except_clause ':' suite try_excepts
        { $1.code = $3; $$ = [ $1 ].concat( $4 ) }
    ;

// except_clause: 'except' [test ['as' NAME]]
// make sure that the default except clause is last
except_clause
    : 'except'
        { $$ = {} }
    | 'except' test
        { $$ = { cond: $2 } }
    | 'except' test 'as' NAME
        { $$ = { cond: $2, name: $4 } }
    ;

// with_stmt: 'with' with_item (',' with_item)*  ':' suite
with_stmt
    : 'with' with_item ':' suite
        { $$ = code.with({ with: $2.with, as: $2.as, code: $4 }) }
    | 'with' with_item with_stmt0 ':' suite
        { 
            $2 = [ $2 ].concat( $3 )
            $$ = code.with({ 
                with: $2.map(function(w){ return w.with }).join( ',' ),
                as: $2.map(function(w){ return w.as }).join( ',' ),
                code: $5 
            })
        }
    ;

with_stmt0
    : ',' with_item
        { $$ = [ $2 ] }
    | ',' with_item with_stmt0
        { $$ = [ $2 ].concat( $3 ) }
    ;

// with_item: test ['as' expr]
with_item
    : test
        { $$ = { with: $1, as: $1 } }
    | test 'as' expr
        { $$ = { with: $1, as: $3 } }
    ;

// suite: simple_stmt | NEWLINE INDENT stmt+ DEDENT
suite
    : simple_stmt
    | NEWLINE INDENT suite0 DEDENT
        { $$ = $3 }
    ;

suite0
    : stmt
        { $$ = [ $1 ].code() }
    | stmt suite0
        { $$ = [ $1 ].concat( $2 ).code() }
    ;

// test: or_test ['if' or_test 'else' test] | lambdef
test
    : or_test
    | or_test 'if' or_test 'else' test
    | lambdef
    ;

// test_nocond: or_test | lambdef_nocond
test_nocond: or_test | lambdef_nocond ;

// lambdef: 'lambda' [varargslist] ':' test
lambdef
    : 'lambda' ':' test
        { $$ = code.lambda({ args: '', code: $3 }) }
    | 'lambda' varargslist ':' test
        { $$ = code.lambda({ args: $2, code: $3 }) }
    ;

// lambdef_nocond: 'lambda' [varargslist] ':' test_nocond
lambdef_nocond
    : 'lambda' ':' test_nocond
    | 'lambda' varargslist ':' test_nocond
    ;

// or_test: and_test ('or' and_test)*
or_test
    : and_test
    | and_test or_test0
        { $$ = $1 + $2 }
    ;

or_test0
    : 'or' and_test
        { $$ = '||' + $2 }
    | 'or' and_test or_test0
        { $$ = '||' + $2 + $3 }
    ;

// and_test: not_test ('and' not_test)*
and_test
    : not_test
    | not_test and_test0
        { $$ = $1 + $2 }
    ;

and_test0
    : 'and' not_test
        { $$ = '&&' + $2 }
    | 'and' not_test and_test0
        { $$ = '&&' + $2 + $3 }
    ;

// not_test: 'not' not_test | comparison
not_test
    : 'not' not_test
    | comparison
    ;

// comparison: expr (comp_op expr)*
comparison
    : expr
    | expr comparison0
        { $$ = $2( $1 ) }
    ;

comparison0
    : comp_op expr
        { 
            $$ = function( a ) {
                return ( typeof $1 == 'function' )
                    ? $1( a, $2 )
                    : a + $1 + $2
                    ;
            }
        }
    | comp_op expr comparison0
        {
            $2 = $3( $2 )
            $$ = function( a ) {
                return ( typeof $1 == 'function' )
                    ? $1( a, $2 )
                    : a + $1 + $2
                    ;
            }
        }
    ;

// comp_op: '<'|'>'|'=='|'>='|'<='|'<>'|'!='|'in'|'not' 'in'|'is'|'is' 'not'
// NOTE: '<>' is removed because we don't need to support __future__
comp_op: '<'|'>'|'=='|'>='|'<='|'!='
    |'in'
        { $$ = function(a,b) { return '(' + b + '.indexOf(' + a + ')!=-1)' } }
    |'not' 'in'
        { $$ = function(a,b) { return '(' + b + '.indexOf(' + a + ')==-1)' } }
    |'is'
        { $$ = '===' }
    |'is' 'not'
        { $$ = '!==' }
    ;

// star_expr: '*' expr
star_expr: '*' expr;

// expr: xor_expr ('|' xor_expr)*
expr
    : xor_expr
    | xor_expr expr0
        { $$ = $1 + $2 }
    ;

expr0
    : '|' xor_expr
        { $$ = $1 + $2 }
    | '|' xor_expr expr0
        { $$ = $1 + $2 + $3 }
    ;

// xor_expr: and_expr ('^' and_expr)*
xor_expr
    : and_expr
    | and_expr xor_expr0
        { $$ = $1 + $2 }
    ;

xor_expr0
    : '^' and_expr
        { $$ = $1 + $2 }
    | '^' and_expr xor_expr0
        { $$ = $1 + $2 + $3 }
    ;

// and_expr: shift_expr ('&' shift_expr)*
and_expr
    : shift_expr
    | shift_expr and_expr0
        { $$ = $1 + $2 }
    ;

and_expr0
    : '&' shift_expr
        { $$ = $1 + $2 }
    | '&' shift_expr and_expr0
        { $$ = $1 + $2 + $3 }
    ;

// shift_expr: arith_expr (('<<'|'>>') arith_expr)*
shift_expr
    : arith_expr
    | arith_expr shift_expr0
        { $$ = $1 + $2 }
    ;

shift_expr0
    : '<<' arith_expr
        { $$ = $1 + $2 }
    | '<<' arith_expr shift_expr0
        { $$ = $1 + $2 + $3 }
    | '>>' arith_expr
        { $$ = $1 + $2 }
    | '>>' arith_expr shift_expr0
        { $$ = $1 + $2 + $3 }
    ;

// arith_expr: term (('+'|'-') term)*
arith_expr
    : term
    | term arith_expr0
        { $$ = $1 + $2 }
    ;

arith_expr0
    : '+' term
        { $$ = $1 + $2 }
    | '+' term arith_expr0
        { $$ = $1 + $2 + $3 }
    | '-' term
        { $$ = $1 + $2 }
    | '-' term arith_expr0
        { $$ = $1 + $2 + $3 }
    ;

// term: factor (('*'|'/'|'%'|'//') factor)*
term
    : factor
    | factor term0
        { $$ = $2( $1 ) }
    ;

term0
    : '*' factor
        { $$ = function(s){ return s + $1 + $2 } }
    | '*' factor term0
        { $$ = function(s){ return s + $1 + $3( $2 ) } }
    | '/' factor
        { $$ = function(s){ return s + $1 + $2 } }
    | '/' factor term0
        { $$ = function(s){ return s + $1 + $3( $2 ) } }
    | '%' factor
        { $$ = function(s){ return s + $1 + $2 } }
    | '%' factor term0
        { $$ = function(s){ return s + $1 + $3( $2 ) } }
    | '//' factor
        { $$ = function(s){ return 'Math.floor(' + s + '/' + $2 + ')' } }
    | '//' factor term0
        { $$ = function(s){ return 'Math.floor(' + s + '/' + $3( $2 ) + ')' } }
    ;

// factor: ('+'|'-'|'~') factor | power
factor
    : '+' factor
        { $$ = $1 + $2 }
    | '-' factor
        { $$ = $1 + $2 }
    | '~' factor
        { $$ = $1 + $2 }
    | power
    ;

// power: atom trailer* ['**' factor]
power
    : atom
    | atom power0
        { $$ = $1 + $2 }
    | atom power0 '**' factor
        { $$ = 'Math.pow(' + $1 + $2 + ',' + $4 + ')' }
    ;

power0
    : trailer
    | trailer power0
        { $$ = $1 + $2 }
    ;

// atom: ('(' [yield_expr|testlist_comp] ')' |
//        '[' [testlist_comp] ']' |
//        '{' [dictorsetmaker] '}' |
//        NAME | NUMBER | STRING+ | '...' | 'None' | 'True' | 'False')
atom
    : '(' ')'
    | '(' yield_expr ')'
    | '(' testlist_comp ')'
    | '[' ']'
        { $$ = code.list({ items: [] }) }
    | '[' testlist_comp ']'
        { $$ = code.list({ items: $2 }) }
    | '{' '}'
        { $$ = code.dict({ pairs: [] }) }
    | '{' dictorsetmaker '}'
        {
            $$ = ( $2[ 0 ].k )
                ? code.dict({ pairs: $2 })
                : code.set({ items: $2 });
        }
    | NAME
    | NUMBER
    | STRING
    | '...'
    | 'None'
        { $$ = 'null' }
    | 'True'
        { $$ = 'true' }
    | 'False'
        { $$ = 'false' }
    ;

// testlist_comp: (test|star_expr) ( comp_for | (',' (test|star_expr))* [','] )
testlist_comp
    : test
        { $$ = [ $1 ] }
    | test ','
        { $$ = [ $1 ] }
    | test testlist_comp_tail
        { $$ = [ $1 ].concat( $2 ) }
    | star_expr
        { $$ = [ $1 ] }
    | star_expr ','
        { $$ = [ $1 ] }
    | star_expr testlist_comp_tail
        { $$ = [ $1 ].concat( $2 ) }
    ;

testlist_comp_tail
    : comp_for
    | testlist_comp_tail0
    ;

testlist_comp_tail0
    : ',' test
        { $$ = [ $2 ] }
    | ',' test ','
        { $$ = [ $2 ] }
    | ',' test testlist_comp_tail0
        { $$ = [ $2 ].concat( $3 ) }
    | ',' star_expr
        { $$ = [ $2 ] }
    | ',' star_expr ','
        { $$ = [ $2 ] }
    | ',' star_expr testlist_comp_tail0
        { $$ = [ $2 ].concat( $3 ) }
    ;

// trailer: '(' [arglist] ')' | '[' subscriptlist ']' | '.' NAME
trailer
    : '(' ')'
        { $$ = $1 + $2 }
    | '(' arglist ')'
        { $$ = $1 + $2 + $3 }
    | '[' ']'
        { $$ = $1 + $2 }
    | '[' subscriptlist ']'
        { $$ = $1 + $2 + $3 }
    | '.' NAME
        { $$ = $1 + $2 }
    ;

// subscriptlist: subscript (',' subscript)* [',']
subscriptlist
    : subscript
        { $$ = [ $1 ] }
    | subscript ','
        { $$ = [ $1 ] }
    | subscript subscriptlist0
        { $$ = [ $1 ].concat( $2 ) }
    ;

subscriptlist0
    : ',' subscript
        { $$ = [ $2 ] }
    | ',' subscript ','
        { $$ = [ $2 ] }
    | ',' subscript subscriptlist0
        { $$ = [ $2 ].concat( $3 ) }
    ;

// subscript: test | [test] ':' [test] [sliceop]
subscript
    : test
    | test ':' test sliceop
    | test ':' test
    | test ':' sliceop
    | test ':'
    | ':' test sliceop
    | ':' sliceop
    | ':'
    ;

// sliceop: ':' [test]
sliceop: ':' | ':' test;

// exprlist: (expr|star_expr) (',' (expr|star_expr))* [',']
exprlist
    : expr
    | expr ','
    | expr exprlist0
        { $$ = $1 + $2 }
    | star_expr
    | star_expr ','
    | star_expr exprlist0
        { $$ = $1 + $2 }
    ;

exprlist0
    : ',' expr
        { $$ = $2 }
    | ',' expr ','
        { $$ = $2 }
    | ',' expr exprlist0
        { $$ = $2 + $3 }
    | ',' star_expr
        { $$ = $2 }
    | ',' star_expr ','
        { $$ = $2 }
    | ',' star_expr exprlist0
        { $$ = $2 + $3 }
    ;

// testlist: test (',' test)* [',']
testlist
    : test
        { $$ = [ $1 ] }
    | test ','
        { $$ = [ $1 ] }
    | test testlist0
        { $$ = [ $1 ].concat( $2 ) }
    ;

testlist0
    : ',' test
        { $$ = [ $2 ] }
    | ',' test ','
        { $$ = [ $2 ] }
    | ',' test testlist0
        { $$ = [ $2 ].concat( $3 ) }
    ;

// dictorsetmaker: ( (test ':' test (comp_for | (',' test ':' test)* [','])) |
//   (test (comp_for | (',' test)* [','])) )
dictorsetmaker
    : test ':' test
        { $$ = [{ k: $1, v: $3 }] }
    | test ':' test ','
        { $$ = [{ k: $1, v: $3 }] }
    | test ':' test comp_for
        { $$ = [{ k: $1, v: $3 }].concat( $4 ) }
    | test ':' test dictmaker
        { $$ = [{ k: $1, v: $3 }].concat( $4 ) }
    | test
            { $$ = [ $1 ] }
    | test ','
        { $$ = [ $1 ] }
    | test comp_for
        { $$ = [ $1 ].concat( $2 ) }
    | test setmaker
        { $$ = [ $1 ].concat( $2 ) }
    ;

dictmaker
    : ',' test ':' test
        { $$ = [{ k: $2, v: $4 }] }
    | ',' test ':' test ','
        { $$ = [{ k: $2, v: $4 }] }
    | ',' test ':' test dictmaker
        { $$ = [{ k: $2, v: $4 }].concat( $5 ) }
    ;

setmaker
    : ',' test
        { $$ = [ $2 ] }
    | ',' test ','
        { $$ = [ $2 ] }
    | ',' test setmaker
        { $$ = [ $2 ].concat( $3 ) }
    ;

// classdef: 'class' NAME ['(' [arglist] ')'] ':' suite
classdef
    : 'class' NAME ':' suite
        { $$ = code.class({ name: $2, code: $4 }) }
    | 'class' NAME '(' ')' ':' suite
        { $$ = code.class({ name: $2, code: $6 }) }
    | 'class' NAME '(' arglist ')' ':' suite
        { $$ = code.class({ name: $2, code: $7, extends: $4 }) }
    ;

// arglist: (argument ',')* (argument [',']
//  |'*' test (',' argument)* [',' '**' test] 
//  |'**' test)
arglist
    : argument
        { $$ = [ $1 ] }
    | argument ','
        { $$ = [ $1 ] }
    | argument arglist0
        { $$ = [ $1 ].concat( $2 ) }
    ;

arglist0
    : ',' argument
        { $$ = [ $2 ] }
    | ',' argument ','
        { $$ = [ $2 ] }
    | ',' argument arglist0
        { $$ = [ $2 ].concat( $3 ) }
    ;


// argument: test [comp_for] | test '=' test
argument
    : test
    | test comp_for
    | test '=' test
    ;

// comp_iter: comp_for | comp_if
comp_iter: comp_for | comp_if ;

// comp_for: 'for' exprlist 'in' or_test [comp_iter]
comp_for
    : 'for' exprlist 'in' or_test
        { $$ = [{ for: $2, in: $4 }] }
    | 'for' exprlist 'in' or_test comp_iter
        { $$ = [{ for: $2, in: $4 }].concat( $5 ) }
    ;

// comp_if: 'if' test_nocond [comp_iter]
comp_if
    : 'if' test_nocond
        { $$ = [{ if: $2 }] }
    | 'if' test_nocond comp_iter
        { $$ = [{ if: $2 }].concat( $3 )}
    ;

// yield_expr: 'yield' [yield_arg]
yield_expr
    : 'yield'
    | 'yield' yield_arg
    ;

// yield_arg: 'from' test | testlist
yield_arg
    : 'from' test
    | testlist
    ;


