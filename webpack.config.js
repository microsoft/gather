const path = require('path');

module.exports = {
    entry: './lib/nb/index.js',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'gather.js',
        libraryTarget: 'amd'
    },
    devtool: "inline-source-map",
    externals: {
        "base/js/namespace": "base/js/namespace"
    },
    node: {
        fs: 'empty'
    },
    module: {
        rules: [{
            test: /\.css$/,
            use: [ 'style-loader', 'css-loader' ]
        }, {
            test: /\.png$/,
            use: [ 'file-loader' ]
        }]
    },
    optimization: {
        minimize: false
    },
    resolve: {
        extensions: ['.js', '.css'],
        modules: [
            'node_modules'
        ]
    }
};