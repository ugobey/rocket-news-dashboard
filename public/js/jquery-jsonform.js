////////////////////
// AttrInfo
////////////////////
class AttrInfo {
  constructor(props) {
    this.props = props;
  }

  getId() {
    return this.props.id;
  }

  getName() {
    return this.props.name;
  }

  getType() {
    return this.props.type;
  }

  getValue() {
    if (typeof(this.props.value) == 'undefined') {
      return '';
    } 
    return this.props.value;
  }

  getMeta() {
    return this.props.meta;
  }

};

////////////////////
// ModelInfo
////////////////////
class ModelInfo {
  constructor(props) {
    this.props = props;
  }

  getName() {
    return this.props.name;
  }

  getAttrInfoList() {
    var attrInfoList = [];
    for (var i in this.props.attrs) {
        attrInfoList.push(new AttrInfo(this.props.attrs[i]));
    }
    return attrInfoList;
  }
};

////////////////////
// Handlers
////////////////////
class StringFieldHandler {
  appendField(boxBody, modelInfo, attrInfo) {
    var fieldGroup = $('<div class="form-group"></div>');
    var fieldLabel = $('<label for="' + attrInfo.getId() +'">' + attrInfo.getName() + '</label>');
    fieldGroup.append(fieldLabel);
    var fieldInput = $('<input type="text" class="form-control" name="' + attrInfo.getId() + '" id="' + attrInfo.getId() + '" value="' + attrInfo.getValue() + '" placeholder="">') 
    fieldGroup.append(fieldInput);
    boxBody.append(fieldGroup);
  }
  validate(modelInfo, attrInfo) {
    // TODO - do validation on min, max ...etc
    return true;
  }
}

class CurrencyFieldHandler {
  appendField(boxBody, modelInfo, attrInfo) {
    var fieldGroup = $('<div class="form-group"></div>');
    var fieldLabel = $('<label for="' + attrInfo.getId() +'">' + attrInfo.getName() + '</label>');
    fieldGroup.append(fieldLabel);
    var fieldInputGroup = $('<div class="input-group"></div>');
    var fieldIcon = $('<div class="input-group-addon"><i class="fa fa-dollar"></i></div>');
    fieldInputGroup.append(fieldIcon);
    var fieldInput = $('<input type="text" class="form-control" name="' + attrInfo.getId() + '" id="' + attrInfo.getId() + '" value="' + attrInfo.getValue() + '" placeholder="">') 
    fieldInputGroup.append(fieldInput);
    fieldGroup.append(fieldInputGroup);
    boxBody.append(fieldGroup);
  }
  validate(modelInfo, attrInfo) {
    // TODO - do validation on min, max ...etc
    return true;
  }
}

class TextFieldHandler {
  appendField(boxBody, modelInfo, attrInfo) {
    var fieldGroup = $('<div class="form-group"></div>');
    var fieldLabel = $('<label for="' + attrInfo.getId() +'">' + attrInfo.getName() + '</label>');
    fieldGroup.append(fieldLabel);
    var fieldInput = $('<textarea class="form-control" rows="3" name="' + attrInfo.getId() + '" id="' + attrInfo.getId() + '" value="' + attrInfo.getValue() + '" placeholder=""></textarea>') 
    fieldGroup.append(fieldInput);
    boxBody.append(fieldGroup);
  }
  validate(modelInfo, attrInfo) {
    // TODO - do validation on min, max ...etc
    return true;
  }
}

class PasswordFieldHandler {
  appendField(boxBody, modelInfo, attrInfo) {
    var fieldGroup = $('<div class="form-group"></div>');
    var fieldLabel = $('<label for="' + attrInfo.getId() +'">' + attrInfo.getName() + '</label>');
    fieldGroup.append(fieldLabel);
    var fieldInput = $('<input type="password" class="form-control" name="' + attrInfo.getId() + '" id="' + attrInfo.getId() + '" placeholder="">') 
    fieldGroup.append(fieldInput);
    boxBody.append(fieldGroup);
  }
  validate(modelInfo, attrInfo) {
    // TODO - do validation on min, max ...etc
    return true;
  }
}

class HiddenFieldHandler {
  appendField(boxBody, modelInfo, attrInfo) {
    var fieldInput = $('<input type="hidden" class="form-control" name="' + attrInfo.getId() + '" id="' + attrInfo.getId() + '" value="' + attrInfo.getValue() + '" placeholder="">') 
    boxBody.append(fieldInput);
  }
  validate(modelInfo, attrInfo) {
    return true;
  }
}

////////////////////
// FormBuilder
////////////////////
class FormBuilder {

  constructor(options) {

    var defaultOptions = {
      method: 'post',  
      action: '#',  
      buttonLabel: 'Submit'  
    };

    options = options || {};
    for (var opt in defaultOptions) {
        if (defaultOptions.hasOwnProperty(opt) && !options.hasOwnProperty(opt)) {
            options[opt] = default_options[opt];
        }
    }

    this.options = options;

    // register handles
    this.registerHandler(FormBuilder.TYPE_HIDDEN, new HiddenFieldHandler());
    this.registerHandler(FormBuilder.TYPE_STRING, new StringFieldHandler());
    this.registerHandler(FormBuilder.TYPE_PASSWORD, new PasswordFieldHandler());
    this.registerHandler(FormBuilder.TYPE_EMAIL, new StringFieldHandler());
    this.registerHandler(FormBuilder.TYPE_TEXT, new TextFieldHandler());
    this.registerHandler(FormBuilder.TYPE_CURRENCY, new CurrencyFieldHandler());
    this.registerHandler(FormBuilder.TYPE_DATETIME, new StringFieldHandler());
  }

  registerHandler(type, handler) {
    FormBuilder.handlers[type] = handler;
  }

  onSubmit(event) {
/*
    for (var i in FormBuilder.sections) {
      var section = FormBuilder.sections[i];
      var modelInfo = section['modelInfo'];
      var attrInfoList = section['modelInfo'].getAttrInfoList();
      for (var i in attrInfoList) {
        var attrInfo = attrInfoList[i];
        var type = attrInfo.getType();
        if (type in event.data.getHandlers()) {
          var handler = event.data.getHandler(type);
          var isValid = handler.validate(modelInfo, attrInfo);
          if (!isValid) {
            // TODO - display error
            return false; 
          }
        }
      }
    }
*/

    // everything is good, let's submit
    return true; 
  }

  openForm(formHeaderId) {
    this._formHeader = $('<form role="form" method="' + this.options.method + '" action="' + this.options.action + '"></form>');
    $(formHeaderId).wrap(this._formHeader);
    $(document).on('submit', this._formHeader, this.onSubmit);
  }

  getHandlers() {
    return FormBuilder.handlers;
  }

  getHandler(type) {
    return FormBuilder.handlers[type];
  }

  createSection(sectionId, modelInfoJson) {
    var modelInfo = new ModelInfo(modelInfoJson);
    var box = $('<div class="box"></div>');

    // boxHeader
    var boxHeader = $('<div class="box-header"></div>');
    var title = $('<div>' + modelInfo.getName() + '</div>');
    boxHeader.append(title);

    // boxBody
    var boxBody = $('<div class="box-body"></div>');
    var attrInfoList = modelInfo.getAttrInfoList();
    for (var i in attrInfoList) {
      var attrInfo = attrInfoList[i];
      var type = attrInfo.getType();
      if (type in FormBuilder.handlers) {
        var handler = FormBuilder.handlers[type];
        handler.appendField(boxBody, modelInfo, attrInfo);
      }
    }

    // boxFooter
    var boxFooter = $('<div class="box-footer"></div>');

    box.append(boxHeader);
    box.append(boxBody);
    box.append(boxFooter);

    $(sectionId).replaceWith(box);

    FormBuilder.sections.push({'modelInfo':modelInfo, 'box':box});
  }

  closeForm(formFooterId) {
    this._formFooter = $('<input type="submit" class="btn btn-primary" value="' + this.options.buttonLabel + '">');
    $(formFooterId).replaceWith(this._formFooter);
  }
}

FormBuilder.TYPE_HIDDEN = "hidden";
FormBuilder.TYPE_STRING = "string";
FormBuilder.TYPE_PASSWORD = "password";
FormBuilder.TYPE_EMAIL = "email";
FormBuilder.TYPE_TEXT = "text";
FormBuilder.TYPE_CURRENCY = "currency";
FormBuilder.TYPE_DATETIME = "datetime";

FormBuilder.handlers = [];
FormBuilder.sections = [];
