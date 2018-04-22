function reverse (str) {
  if (str === '') {
    return '';
  }
  else {
    return reverse(str.substr(1)) + str[0];
  }
}

console.log(reverse('hello'));