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
    x = 4
finally:
    y = x
z = y
