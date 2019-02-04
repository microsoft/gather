# Code Gathering Tools

Tool for gathering, recalling, comparing implicit versions of code in Jupyter Lab. Read the paper [here](dead link).

## Download the Jupyter Lab extension

```bash
# This download link is currently dead
jupyter labextension install gathering-tools
```

## Development

For a development install (requires npm version 4 or later), do the following in the repository directory:

```bash
npm install                   # download dependencies
jupyter labextension link .   # install this package in Jupyter Lab
jlpm run watch                # automatically recompile sources
jupyter lab --watch           # launch Jupyter Lab, automatically re-load extension
```

These setup instructions have been successfully completed with Node v9.5.0.

### Pre-alpha Jupyter notebook version

This project was initially developed as a Jupyter notebook extension. It is not being maintained, as it requires access to the internal API, including parts that change across minor versions. Still, if you want to build and install the notebook version, run these commands:

```bash
npm run build
npm run build_nb_extension
npm run install_nb_extension
```

### Troubleshooting

#### The extension UI doesn't get loaded

Sometimes you might reload the page and see that the buttons on the page are missing. I haven't been able to track the cause of the issue. [This Stack Overflow post](https://stackoverflow.com/questions/11991218/undefined-object-being-passed-via-requirejs) suggests the issue might be with circular `require` dependencies. The problem has disappeared when I have:

* Deleted the virtual environment containing Jupyter, and installing it globally, or
* Removed what I thought might be circular dependencies in the project

But I don't know if either of these *really* fixed the issue. They're worth trying if the gathering UI disappears.

Then run `jupyter notebook` and the extension will be running.

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

### Backend (logging) extension (optional)

If you want to add logging to the project, look in the `src/nb/python` directory. This Python plugin needs to be installed to receive logging requests and save them to file (`~/.jupyter/events.txt`). To register this Python extension in Jupyter notebook or lab, see this guide: https://jupyter-notebook.readthedocs.io/en/latest/extending/handlers.html. As of the time of this writing, installation involves:

```bash
pip install portalocker  # dependency for this package
cd src/nb/python
python setup.py install  # build this package
jupyter serverextension enable --py gather_logger  # enable the package
```

We aren't yet including the frontend extension in the server extension, nor do we have a good way to develop the plugin in development mode yet. To do either of these two things, follow the instructions here:
https://jupyter-notebook.readthedocs.io/en/latest/examples/Notebook/Distributing%20Jupyter%20Extensions%20as%20Python%20Packages.html .
