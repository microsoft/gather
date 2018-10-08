# livecells

Tool for gathering, recalling, comparing implicit versions of code in Jupyter Notebook / Lab.

## Prerequisites

* JupyterLab

## Jupyter Lab extension

```bash
jupyter labextension install livecells
```

### Development

For a development install (requires npm version 4 or later), do the following in the repository directory:

```bash
npm install
jupyter labextension link .
```

To rebuild the package and the JupyterLab app:

```bash
npm run build
jupyter lab build
```

## Notebook extension

### Frontend extension

```bash
npm run build
npm run build_nb_extension
npm run install_nb_extension
```

#### Troubleshooting

##### The extension UI doesn't get loaded

Sometimes you might reload the page and see that the buttons on the page are missing. I haven't been able to track the cause of the issue. [This Stack Overflow post](https://stackoverflow.com/questions/11991218/undefined-object-being-passed-via-requirejs) suggests the issue might be with circular `require` dependencies. The problem has disappeared when I have:

* Deleted the virtual environment containing Jupyter, and installing it globally, or
* Removed what I thought might be circular dependencies in the project

But I don't know if either of these *really* fixed the issue. They're worth trying if the gathering UI disappears.

Then run `jupyter notebook` and the extension will be running.

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
