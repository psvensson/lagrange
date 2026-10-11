#define _GNU_SOURCE
#include <malloc.h>
#include <stdio.h>
#include <stdlib.h>
int main(void) {
  void *p = malloc(432);
  if (p == NULL) return 2;
  printf("request=432 usable=%zu\n", malloc_usable_size(p));
  free(p);
  return 0;
}
