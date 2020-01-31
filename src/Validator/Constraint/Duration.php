<?php

namespace App\Validator\Constraint;

use Symfony\Component\OptionsResolver\Exception\MissingOptionsException;
use Symfony\Component\Validator\Constraint;

class Duration extends Constraint
{
  const DURATION_EXCEEDED_ERROR = 'cabf24ed-7c66-4522-9710-96ee7d263624';
  const DURATION_UNKNOWN_ERROR = '84a56aba-179a-420f-9814-2f8e177ec144';

  protected static $errorNames = [
    self::DURATION_EXCEEDED_ERROR => 'DURATION_EXCEEDED_ERROR',
    self::DURATION_UNKNOWN_ERROR => 'DURATION_UNKNOWN_ERROR',
  ];

  public $maxMessage = 'Duration must be less than {{ limit }} seconds.';
  public $invalidMessage = 'Duration could not be determined.';
  public $max;

  public function __construct($options = null)
  {
    if (null !== $options && !\is_array($options)) {
      $options = [
        'max' => $options,
      ];
    }

    parent::__construct($options);

    if (null === $this->max) {
      throw new MissingOptionsException(sprintf('Option "%s" must be given for constraint %s', __CLASS__, 'max'));
    }
  }
}
