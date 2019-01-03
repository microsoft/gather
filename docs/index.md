---
layout: default
title: Code gathering tools
---

# Code gathering tools

Code gathering tools help you clean, recover, and compare
versions of code in computational notebooks.

For instance, with code gathering tools, you can select a
result in your notebook, and then create an entirely new
notebook with nothing but the subset of cells, in order,
that were used to compute it.

# Installing gathering tools

This command doesn't currently work, but it will soon!

```
jupyter labextension install gather
```

# Using gathering tools

*TODO: Add a bunch of GIFs here. Show examples of gathering
to notebook, gathering to cells, gathering to scripts, and
gathering history.*

# Learn More

Curious about how we designed and built code gathering
tools? Read our technical paper!

**Managing Messes in Computational Notebooks**. Andrew Head,
Fred Hohman, Titus Barik, Steven Drucker, and Robert
DeLine. To appear at the ACM Conference on Human Factors in
Computing Systems, CHI 2019.

*A link to pre-print will be posted soon!*

Replication materials for the in-lab usability study can be
found [here (TODO)](broken link).

# Questions and Answers

**Will my notebook take up more storage space when I use
this extension?**

Yes, by design. To help you recover code that has been
deleted or overwritten, your notebook will be saved with all
lines of code you executed in it. That said, the
storage space of this text should be small compared to the
outputs saved in the notebook.

**Will this extension make my notebook run slower?**

Hopefully not. If it does, let us know by [submitting a bug
request](https://github.com/Microsoft/gather/issues/new/choose).

**The paper had a feature where you could compare versions
of cell outputs side by side. How do I enable that?**

We're hoping to add that feature back into the tool soon.
When we do, we'll update this answer with details.

**I found a bug. Can you fix it?**

[Submit a bug request](https://github.com/Microsoft/gather/issues/new/choose)
and we'll see what we can do.

**This is tool [extremely / somewhat / not that] useful.**

We're actively working on improving these tools to help
analysts manage messes in their notebooks. Submit a feature
request if you have an idea of something we should add. Or
just send us an email telling us about how you use them.
