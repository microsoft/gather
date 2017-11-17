x=1
try:
    x += 2
    if x > 10:
        raise Exception()
except IOError:
    print('file')
except:
    print('oops')
else:
    print(x)
finally:
    x = 0
    y = 0
