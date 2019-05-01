# Gather - Code Cleanup for Jupyter Notebooks

Tool for cleaning code, recovering lost code, and version
control in Jupyter Lab.

Download the extension with one command:

```bash
jupyter labextension install gather
```

If you are seeing installation errors, make sure that npm
and Jupyter Lab are up-to-date.

Read the docs [here](https://microsoft.github.io/gather).
And read our academic paper on the design of the tool
[here](https://people.eecs.berkeley.edu/~andrewhead/pdf/notebooks.pdf).

## Contributing

To set up the code for this repository, run:

```bash
git clone <this-repository-url>  # clone the repository
npm install                      # download dependencies
jupyter labextension link .      # install this package in Jupyter Lab
jlpm run watch                   # automatically recompile source code
jupyter lab --watch              # launch Jupyter Lab, automatically re-load extension
```

This requires npm version 4 or later, and was tested most
recently with Node v9.5.0.

Before submitting a pull request, format the code files by
running `jlpm run format:all`.

### Testing the extension

The tests assume you have Google Chrome installed on your
computer. Because this plugin depends on Jupyter Lab and in
turn on browser functionality, some of these tests need a
browser to run in.

To run the tests from the command line, call:

```bash
npm run test
```

Wait a few seconds while the code compiles, and then you
should see the results of running the tests. The process
will continue to live after the tests finish running---it
will recompile and re-run the tests whenever the test code
changes. Type Ctrl+C to abort the command at any time.

Note that running tests with this command may interfere with
you opening Chrome browsers. If that happens, cancel the
command, open Chrome, and then restart the command.

To debug the tests, call:

```bash
npm run test:debug
```

This will launch a Chrome window. Click the **DEBUG**
button in the page that opens. Launch the Chrome developer
tools (View -> Developer -> Developer Tools). The "Console"
will show the test results, with one line for each test. In
the "Sources" tab, you can open scripts using the file prompt
(Cmd + P on Mac, Ctrl + P on Windows) and set breakpoints in
the code. When you refresh the page, the tests will be run
again, and the debugger will trigger when the first
breakpoint is reached.

### Packaging the project for beta users

Package up the project as follows:

```bash
npm pack  # output: <package-name>-<version>.tgz
```

Then send the package to someone else, and have them install
it using this command:

```bash
jupyter labextension install <package-name>-<version>.tgz
```

### Publishing to a private repository

If you want to test publishing the package to npm, you can
use the following commands.

```bash
npm login  # requires credentials for a valid npm account
npm publish --access=restricted  # make this public eventually
```

### Troubleshooting

#### `500` message when launching Jupyter notebook

Install these versions of Jupyter notebook and dependencies
to see something working, before trying out other versions:

```
nbconvert==5.3.1
nbformat==4.4.0
notebook==5.6.0
```

#### Build errors

* **Errors about missing semicolons in React types files**: upgrade the `typescript` and `ts-node` packages
* **Conflicting dependencies**: upgrade either the Python Jupyter Lab (may require Python upgrade to Python 3 to get the most recent version of Jupyter Lab) or the Jupyter Lab npm pacakges
* **Issues with duplicated React types**: download React types in `@jupyterlab/` packages
* **Other issues**: delete your node_modules files and reinstall them
