/* eslint-disable @typescript-eslint/no-var-requires */
const path = require("path");
const webpack = require("webpack");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");
require("dotenv").config();

const DEV_PORT = 3005;

module.exports = async (env, argv) => {
  const dev = argv.mode === "development";

  // The dev server needs a trusted HTTPS certificate: Outlook refuses to load add-ins over HTTP.
  let httpsOptions;
  if (env && env.WEBPACK_SERVE) {
    try {
      httpsOptions = await require("office-addin-dev-certs").getHttpsServerOptions();
    } catch (e) {
      console.warn("Could not load the Office dev certificate. Run `npm run certs` first.", e.message);
    }
  }

  return {
    devtool: dev ? "inline-source-map" : false,
    entry: { taskpane: "./src/taskpane/index.tsx" },
    output: {
      path: path.resolve(__dirname, "dist"),
      filename: "[name].js",
      clean: true,
    },
    resolve: { extensions: [".ts", ".tsx", ".js"] },
    module: {
      rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: { loader: "ts-loader", options: { transpileOnly: true } } }],
    },
    plugins: [
      new webpack.DefinePlugin({
        __PWH_CLIENT_ID__: JSON.stringify(process.env.PWH_CLIENT_ID || ""),
        __PWH_AUTHORITY__: JSON.stringify(process.env.PWH_AUTHORITY || "https://login.microsoftonline.com/organizations"),
        __PWH_VERSION__: JSON.stringify(require("./package.json").version),
      }),
      new HtmlWebpackPlugin({
        filename: "taskpane.html",
        template: "./src/taskpane/taskpane.html",
        chunks: ["taskpane"],
        // Cache-bust the script so Outlook's webview picks up new deployments.
        hash: true,
      }),
      new CopyWebpackPlugin({ patterns: [{ from: "assets", to: "assets" }] }),
    ],
    performance: { hints: false },
    devServer: {
      port: DEV_PORT,
      hot: false,
      liveReload: true,
      headers: { "Access-Control-Allow-Origin": "*" },
      server: httpsOptions ? { type: "https", options: httpsOptions } : "https",
      static: { directory: path.resolve(__dirname, "dist") },
    },
  };
};
